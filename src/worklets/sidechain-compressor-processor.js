/**
 * sidechain-compressor-processor.js
 *
 * AudioWorkletProcessor that implements sidechain compression.
 *
 * Inputs:
 *   inputs[0]  — main signal (e.g. Deck B). Pass-through with gain reduction.
 *   inputs[1]  — sidechain trigger (e.g. kick pad bus). Drives the gain
 *                reduction; its audio is NOT passed to the output.
 *
 * Output:
 *   outputs[0] — gain-reduced main signal.
 *
 * Algorithm:
 *   Each block the RMS of the sidechain input is computed. A target gain is
 *   derived: when the sidechain RMS exceeds the threshold the gain is reduced
 *   proportionally (ratio). Attack and release are implemented as a one-pole
 *   smoother on the gain coefficient so pumping is smooth rather than stepped.
 *
 * Parameters (AudioParam — set via AudioWorkletNode.parameters):
 *   threshold   — sidechain RMS level that starts gain reduction (linear, 0-1, default 0.1)
 *   ratio       — compression ratio expressed as depth: 1 = full duck, 0 = no duck (default 0.85)
 *   attack      — attack time constant in seconds (default 0.005)
 *   release     — release time constant in seconds (default 0.15)
 *
 * Registration:
 *   await audioContext.audioWorklet.addModule('/src/worklets/sidechain-compressor-processor.js');
 *   const node = new AudioWorkletNode(audioContext, 'sidechain-compressor-processor', {
 *     numberOfInputs: 2,
 *     numberOfOutputs: 1,
 *     outputChannelCount: [2],
 *   });
 *   // Connect main signal to input 0:
 *   deckBOutput.connect(node, 0, 0);
 *   // Connect sidechain trigger to input 1:
 *   kickBusGain.connect(node, 0, 1);
 *   // Connect output to destination:
 *   node.connect(crossfaderInputB);
 */

class SidechainCompressorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'threshold',
        defaultValue: 0.1,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
      {
        name: 'ratio',
        defaultValue: 0.85,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
      {
        name: 'attack',
        defaultValue: 0.005,
        minValue: 0.0001,
        maxValue: 1,
        automationRate: 'k-rate',
      },
      {
        name: 'release',
        defaultValue: 0.15,
        minValue: 0.001,
        maxValue: 5,
        automationRate: 'k-rate',
      },
    ];
  }

  constructor(options) {
    super(options);
    // Current gain coefficient (1 = no reduction, 0 = full silence)
    this._gain = 1.0;
  }

  /**
   * Compute RMS of a single channel Float32Array block.
   * Returns 0 if the channel is empty or all-zero.
   */
  _rms(channel) {
    if (!channel || channel.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < channel.length; i++) {
      sum += channel[i] * channel[i];
    }
    return Math.sqrt(sum / channel.length);
  }

  process(inputs, outputs, parameters) {
    const mainIn = inputs[0];    // main signal (Deck B)
    const scIn   = inputs[1];    // sidechain trigger (kick bus)
    const out    = outputs[0];

    // Read k-rate parameters (single value per block)
    const threshold = parameters.threshold[0];
    const ratio     = parameters.ratio[0];
    const attack    = parameters.attack[0];
    const release   = parameters.release[0];

    // Derive time constants as one-pole coefficients for the sample rate.
    // coeff = e^(-1 / (timeConst * sampleRate))
    const attackCoeff  = Math.exp(-1 / (attack  * sampleRate));
    const releaseCoeff = Math.exp(-1 / (release * sampleRate));

    // ── Compute sidechain RMS (mix down to mono if multichannel) ──
    let scRms = 0;
    if (scIn && scIn.length > 0) {
      let chRmsSum = 0;
      for (let ch = 0; ch < scIn.length; ch++) {
        chRmsSum += this._rms(scIn[ch]);
      }
      scRms = chRmsSum / scIn.length;
    }

    // ── Compute target gain ──
    // If sidechain RMS exceeds threshold, duck proportional to excess.
    let targetGain = 1.0;
    if (scRms > threshold) {
      // Amount above threshold (0..1)
      const excess = Math.min((scRms - threshold) / (1.0 - threshold + 1e-9), 1.0);
      // ratio=1 → full duck to 0; ratio=0 → no duck
      targetGain = 1.0 - ratio * excess;
      targetGain = Math.max(0, targetGain);
    }

    // ── Apply one-pole smoother per-sample ──
    // For the entire block we apply the smoothed gain sample-by-sample so
    // that attack/release are continuous rather than stepped per-block.
    const mainInL = (mainIn && mainIn.length > 0) ? mainIn[0] : null;
    const mainInR = (mainIn && mainIn.length > 1) ? mainIn[1] : mainInL;
    const outL    = out[0];
    const outR    = out[1] ?? out[0];

    if (!mainInL || !outL) {
      // No main input — output silence but keep processor alive
      return true;
    }

    const blockSize = mainInL.length;

    // Determine if we need to downmix stereo input to mono output
    const stereoInputMonoOutput = (outR === outL) && mainInR && (mainInR !== mainInL);

    for (let i = 0; i < blockSize; i++) {
      // One-pole smooth toward targetGain
      if (targetGain < this._gain) {
        // Attack: gain is decreasing (duck is happening)
        this._gain = attackCoeff * this._gain + (1 - attackCoeff) * targetGain;
      } else {
        // Release: gain is recovering
        this._gain = releaseCoeff * this._gain + (1 - releaseCoeff) * targetGain;
      }

      if (stereoInputMonoOutput) {
        // Downmix stereo input to mono output
        outL[i] = (mainInL[i] + mainInR[i]) * 0.5 * this._gain;
      } else {
        outL[i] = mainInL[i] * this._gain;
        if (outR !== outL && mainInR) {
          outR[i] = mainInR[i] * this._gain;
        }
      }
    }

    return true;
  }
}

registerProcessor('sidechain-compressor-processor', SidechainCompressorProcessor);
