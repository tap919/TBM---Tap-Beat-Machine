/**
 * vst-insert-processor.js
 *
 * AudioWorkletProcessor that routes each audio block through one or more
 * loaded VST3 native instances via the Electron IPC bridge
 * (window.vstBridge.processBlock).
 *
 * Architecture:
 *   Web Audio graph  →  VstInsertProcessor (AudioWorklet)
 *                            |
 *                       window.vstBridge.processBlock(instanceId, L, R, n)
 *                            |
 *                       native vst-host.node  (in-process N-API addon)
 *                            |
 *                       processed audio back to Web Audio graph
 *
 * IMPORTANT LIMITATIONS:
 * - AudioWorklet runs in a separate AudioWorkletGlobalScope that has NO access
 *   to window, DOM, or Electron IPC directly.
 * - To call vstBridge we post a message to the main thread and wait for the
 *   reply.  Because AudioWorklet.process() is synchronous, we cannot truly
 *   await an async IPC call inside process().
 *
 * STRATEGY — double-buffered async dispatch (serial chain):
 *   1. process() copies the current input block into a pending Float32Array.
 *   2. It posts a "processBlock" message to the main thread with the raw buffer
 *      and the FIRST instance ID.
 *   3. The main thread calls vstBridge.processBlock(), then posts back the result
 *      with the next instanceId to process (if any), continuing the serial chain.
 *   4. When all instances in the chain have processed the block the main thread
 *      posts a final "processResult" message.
 *   5. The worklet stores the returned buffer and outputs it on the NEXT process()
 *      call (one block of latency — 128 samples at 44.1 kHz ≈ 2.9 ms).
 *   6. While waiting for the first reply, it outputs silence (or dry pass-through).
 *
 * Registration:
 *   await audioContext.audioWorklet.addModule('/src/worklets/vst-insert-processor.js');
 *   const node = new AudioWorkletNode(audioContext, 'vst-insert-processor');
 *   node.port.onmessage = handleWorkletMessage;   // wire reply path
 *
 * Messages TO worklet  (via node.port.postMessage):
 *   { type: 'setInstances', instanceIds: string[] }
 *       - Set the ordered list of VST instance IDs to process through.
 *         An empty array bypasses all processing (dry pass-through).
 *   { type: 'processResult', id: number, outputL: ArrayBuffer, outputR: ArrayBuffer }
 *       - Reply from the main thread with fully-chained processed audio.
 *
 * Messages FROM worklet (via port.onmessage in main thread):
 *   { type: 'processBlock', id: number, instanceIds: string[],
 *     inputL: ArrayBuffer, inputR: ArrayBuffer, blockSize: number }
 *       - Request to process one block through the FULL chain of VST instances
 *         in order.  The main thread is responsible for calling each instance
 *         sequentially and returning the final result.
 *
 * ENGINE-25 / WORKER-31 fix:
 *   Previously only _instanceIds[0] was dispatched; the rest were silently
 *   skipped.  Now the full instanceIds array is forwarded so the main thread
 *   can chain all instances in order.
 */

class VstInsertProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);

    /** Ordered list of VST instance IDs to process through. */
    this._instanceIds = [];

    /** Incrementing message ID for correlating async replies. */
    this._msgId = 0;

    /**
     * Pending block waiting for a native reply.
     * Holds { id, timestamp } while a processBlock request is in flight.
     * null when no request is pending.
     */
    this._pending = null;

    /**
     * Maximum time (in process() calls) to wait for a reply before
     * abandoning the pending request.  At 128 samples / 44100 Hz each
     * call is ~2.9 ms, so 128 calls ≈ 370 ms — generous but finite.
     */
    this._pendingTimeout = 128;
    this._pendingAge = 0;

    /**
     * Last successfully processed output — output on the next process() call.
     * Initialised to null (silence until first reply arrives).
     */
    this._readyOutputL = null;
    this._readyOutputR = null;

    this.port.onmessage = (ev) => this._onMessage(ev.data);
  }

  _onMessage(msg) {
    if (msg.type === 'setInstances') {
      this._instanceIds = Array.isArray(msg.instanceIds) ? msg.instanceIds : [];
      // Flush any pending buffer — bypass routing has changed
      this._pending = null;
      this._readyOutputL = null;
      this._readyOutputR = null;
      return;
    }

    if (msg.type === 'processResult') {
      if (this._pending && this._pending.id === msg.id) {
        try {
          this._readyOutputL = new Float32Array(msg.outputL);
          this._readyOutputR = new Float32Array(msg.outputR);
          this._pending = null;
          this._pendingAge = 0;
        } catch (err) {
          // Malformed reply — clear pending and fall through to pass-through
          console.error('[VstInsertProcessor] Invalid processResult buffers:', err);
          this._pending = null;
          this._pendingAge = 0;
        }
      }
    }
  }

  /**
   * Called by the Web Audio rendering thread every ~128 samples.
   * Returns true to keep the processor alive.
   */
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    // Silence guard
    if (!input || input.length === 0 || !output || output.length === 0) {
      return true;
    }

    const inputL = input[0] ?? new Float32Array(128);
    const inputR = input[1] ?? inputL; // mono fallback
    const outL = output[0];
    const outR = output[1] ?? output[0];
    const blockSize = inputL.length;

    // ── No instances: pass through dry ──────────────────────────────────────
    if (this._instanceIds.length === 0) {
      outL.set(inputL);
      if (outR !== outL) outR.set(inputR);
      return true;
    }

    // ── Write last ready output (from previous block's async reply) ──────────
    if (this._readyOutputL && this._readyOutputL.length === blockSize) {
      outL.set(this._readyOutputL);
      if (outR !== outL && this._readyOutputR) {
        outR.set(this._readyOutputR);
      }
    } else {
      // No ready output yet — pass through dry to avoid silence artifact
      outL.set(inputL);
      if (outR !== outL) outR.set(inputR);
    }

    // ── Dispatch async processing for the CURRENT input block ────────────────
    // Only dispatch if no block is already pending (one-at-a-time to avoid
    // runaway message queues under high CPU load).
    if (this._pending !== null) {
      // Timeout: if the main thread never replies, abandon the pending request
      // so we can send a new one.  Without this, a dropped reply would stall
      // VST processing permanently.
      this._pendingAge++;
      if (this._pendingAge >= this._pendingTimeout) {
        this._pending = null;
        this._pendingAge = 0;
      }
    }

    if (this._pending === null && this._instanceIds.length > 0) {
      const id = ++this._msgId;

      // ENGINE-25 / WORKER-31 fix:
      // Forward the FULL instanceIds array so the main thread chains ALL VST
      // instances in sequence, not just the first one.
      const instanceIds = this._instanceIds.slice();

      // Transfer ownership of copies to avoid GC allocation on each block
      const bufL = inputL.buffer.slice(inputL.byteOffset, inputL.byteOffset + inputL.byteLength);
      const bufR = inputR.buffer.slice(inputR.byteOffset, inputR.byteOffset + inputR.byteLength);

      this._pending = { id };
      this._pendingAge = 0;

      this.port.postMessage(
        { type: 'processBlock', id, instanceIds, inputL: bufL, inputR: bufR, blockSize },
        [bufL, bufR], // transfer — avoids copy
      );
    }

    return true;
  }
}

registerProcessor('vst-insert-processor', VstInsertProcessor);
