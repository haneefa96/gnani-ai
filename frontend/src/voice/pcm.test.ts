import { describe, expect, it } from "vitest";
import {
  FRAME_BYTES,
  FRAME_SAMPLES,
  PcmFrameFramer,
  TARGET_SAMPLE_RATE,
  downsampleTo16k,
  float32ToPcm16,
  padFinalFrame,
  slicePcm16Frames,
} from "./pcm";

describe("pcm helpers", () => {
  it("downsamples 48 kHz and 44.1 kHz audio to 16 kHz", () => {
    const input48k = new Float32Array(480); // 10 ms at 48 kHz
    const out16kFrom48k = downsampleTo16k(input48k, 48_000);
    expect(out16kFrom48k.length).toBe(160);

    const input44k = new Float32Array(4410); // 100 ms at 44.1 kHz
    const out16kFrom44k = downsampleTo16k(input44k, 44_100);
    expect(out16kFrom44k.length).toBe(1600);

    const passthrough = downsampleTo16k(
      new Float32Array([0.5, -0.5]),
      TARGET_SAMPLE_RATE,
    );
    expect(Array.from(passthrough)).toEqual([0.5, -0.5]);
  });

  it("clamps and converts Float32 samples to signed 16-bit PCM", () => {
    const pcm = float32ToPcm16(new Float32Array([-1.5, -1.0, 0, 1.0, 1.5]));
    expect(Array.from(pcm)).toEqual([-32768, -32768, 0, 32767, 32767]);
  });

  it("slices PCM16 into exact 1,024-byte little-endian frames and preserves remainder", () => {
    const sample1 = new Int16Array(FRAME_SAMPLES + 100);
    sample1.fill(258); // 0x0102 -> little-endian [0x02, 0x01]

    const first = slicePcm16Frames(sample1);
    expect(first.frames).toHaveLength(1);
    expect(first.frames[0]?.byteLength).toBe(FRAME_BYTES);
    expect(first.frames[0]?.[0]).toBe(0x02);
    expect(first.frames[0]?.[1]).toBe(0x01);
    expect(first.remainder.length).toBe(100);

    const tail = padFinalFrame(first.remainder);
    expect(tail?.byteLength).toBe(FRAME_BYTES);
    expect(tail?.[199]).toBe(0x01);
    expect(tail?.[200]).toBe(0x00); // zero-padded tail
  });

  it("streams 128-sample 48 kHz WebAudio quanta through PcmFrameFramer cleanly", () => {
    const framer = new PcmFrameFramer();
    const emitted: Uint8Array[] = [];

    // 48 quanta * 128 samples = 6,144 samples at 48 kHz = 2,048 samples at 16 kHz = 4 exact frames
    for (let q = 0; q < 48; q += 1) {
      const quantum = new Float32Array(128).fill(0.25);
      emitted.push(...framer.pushFloat32(quantum, 48_000));
    }

    expect(emitted.length).toBeGreaterThanOrEqual(3);
    for (const frame of emitted) {
      expect(frame.byteLength).toBe(FRAME_BYTES);
    }

    const finalFrame = framer.flush();
    if (finalFrame) {
      expect(finalFrame.byteLength).toBe(FRAME_BYTES);
    }
    expect(framer.flush()).toBeNull();
  });
});
