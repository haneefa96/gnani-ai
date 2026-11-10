/**
 * Pure PCM audio conversion and framing helpers.
 * Zero DOM/WebAudio globals so unit tests run directly in Node/Vitest.
 */

export const TARGET_SAMPLE_RATE = 16_000;
export const FRAME_SAMPLES = 512;
export const FRAME_BYTES = FRAME_SAMPLES * 2; // 1,024 bytes = 32 ms at 16 kHz mono PCM16

/**
 * Downsample mono Float32 audio from inputSampleRate to 16,000 Hz using linear interpolation.
 */
export function downsampleTo16k(
  samples: Float32Array,
  inputSampleRate: number,
): Float32Array {
  if (inputSampleRate <= 0 || !Number.isFinite(inputSampleRate)) {
    throw new Error(`Invalid input sample rate: ${inputSampleRate}`);
  }
  if (samples.length === 0) {
    return new Float32Array(0);
  }
  if (inputSampleRate === TARGET_SAMPLE_RATE) {
    return new Float32Array(samples);
  }

  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  const outLength = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Float32Array(outLength);
  const lastIndex = samples.length - 1;

  for (let i = 0; i < outLength; i += 1) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = samples[idx] ?? 0;
    const s1 = samples[Math.min(idx + 1, lastIndex)] ?? s0;
    out[i] = s0 + (s1 - s0) * frac;
  }
  return out;
}

/**
 * Convert normalized Float32 [-1.0, 1.0] samples to signed 16-bit integers.
 */
export function float32ToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    out[i] =
      clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
  }
  return out;
}

/**
 * Encode 512 Int16 samples into an explicit little-endian 1,024-byte Uint8Array frame.
 */
function encodeFrameLittleEndian(
  samples: Int16Array,
  offset: number,
): Uint8Array {
  const frame = new Uint8Array(FRAME_BYTES);
  const view = new DataView(frame.buffer);
  for (let i = 0; i < FRAME_SAMPLES; i += 1) {
    const sample = offset + i < samples.length ? (samples[offset + i] ?? 0) : 0;
    view.setInt16(i * 2, sample, true);
  }
  return frame;
}

export interface SlicedFrames {
  frames: Uint8Array[];
  remainder: Int16Array;
}

/**
 * Slice PCM16 samples (+ optional leftover tail) into exact 1,024-byte little-endian frames.
 */
export function slicePcm16Frames(
  pcm16: Int16Array,
  pendingTail?: Int16Array,
): SlicedFrames {
  let combined: Int16Array;
  if (pendingTail && pendingTail.length > 0) {
    combined = new Int16Array(pendingTail.length + pcm16.length);
    combined.set(pendingTail, 0);
    combined.set(pcm16, pendingTail.length);
  } else {
    combined = pcm16;
  }

  const frames: Uint8Array[] = [];
  let offset = 0;
  while (offset + FRAME_SAMPLES <= combined.length) {
    frames.push(encodeFrameLittleEndian(combined, offset));
    offset += FRAME_SAMPLES;
  }

  const remainder = combined.slice(offset);
  return { frames, remainder };
}

/**
 * Pad any leftover <512-sample tail with zeros into one final 1,024-byte frame.
 */
export function padFinalFrame(remainder: Int16Array): Uint8Array | null {
  if (remainder.length === 0) {
    return null;
  }
  return encodeFrameLittleEndian(remainder, 0);
}

/**
 * Stateful framer shared by AudioWorkletProcessor and unit tests.
 */
export class PcmFrameFramer {
  private remainder: Int16Array = new Int16Array(0);

  pushFloat32(samples: Float32Array, inputSampleRate: number): Uint8Array[] {
    const downsampled = downsampleTo16k(samples, inputSampleRate);
    const pcm16 = float32ToPcm16(downsampled);
    const sliced = slicePcm16Frames(pcm16, this.remainder);
    this.remainder = sliced.remainder;
    return sliced.frames;
  }

  flush(): Uint8Array | null {
    const finalFrame = padFinalFrame(this.remainder);
    this.remainder = new Int16Array(0);
    return finalFrame;
  }

  reset(): void {
    this.remainder = new Int16Array(0);
  }
}
