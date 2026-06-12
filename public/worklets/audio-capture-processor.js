/**
 * audio-capture-processor.js — AudioWorklet processor that captures the
 * final mixed audio output and forwards it to the main thread via port
 * messages for native audio backend playback.
 *
 * Usage:
 *   const node = new AudioWorkletNode(ctx, 'audio-capture-processor');
 *   node.port.onmessage = (e) => {
 *     // e.data = { left: Float32Array, right: Float32Array }
 *     // Forward through IPC to native audio-backend addon
 *   };
 *   // Connect the signal chain into this node:
 *   masterOutputNode.connect(node);
 *   // Also connect to destination so the user still hears through Web Audio
 *   // if desired, or disconnect destination for exclusive native output.
 *
 * The processor accumulates 128-sample blocks from Web Audio's render quantum
 * and posts them immediately. The native side's ring buffer absorbs timing jitter.
 */

/* eslint-disable no-undef */
// @ts-nocheck — AudioWorkletProcessor is only available in worklet scope

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._active = true;

    // Listen for control messages from the main thread
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'stop') {
        this._active = false;
      } else if (event.data && event.data.type === 'start') {
        this._active = true;
      }
    };
  }

  /**
   * Called by the Web Audio rendering thread for every 128-sample quantum.
   * @param {Float32Array[][]} inputs  - input channels (we expect 1 input with 2 channels)
   * @param {Float32Array[][]} _outputs - not used (pass-through)
   * @param {Object} _parameters - not used
   * @returns {boolean} true to keep processor alive
   */
  process(inputs, _outputs, _parameters) {
    if (!this._active) return true;

    const input = inputs[0];
    if (!input || input.length === 0) return true;

    // Stereo: channels 0 and 1. Mono sources get duplicated to both channels.
    const left = input[0];
    const right = input.length > 1 ? input[1] : input[0];

    if (!left || left.length === 0) return true;

    // Copy the data (the underlying buffers are recycled by the audio thread)
    // Using slice() to create owned copies that survive the postMessage transfer.
    this.port.postMessage({
      left: left.slice(),
      right: right.slice(),
    });

    return true;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
