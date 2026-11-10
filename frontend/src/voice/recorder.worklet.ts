import { PcmFrameFramer } from "./pcm";

// Minimal global/AudioWorklet declarations so strict tsc passes without extra @types packages.
declare const sampleRate: number;
declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessorBase
): void;

interface AudioWorkletPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

declare class AudioWorkletProcessorBase {
  readonly port: AudioWorkletPort;
  constructor();
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}

const BaseProcessor: typeof AudioWorkletProcessorBase =
  (globalThis as unknown as { AudioWorkletProcessor: typeof AudioWorkletProcessorBase })
    .AudioWorkletProcessor ??
  class {
    readonly port!: AudioWorkletPort;
    process(): boolean {
      return true;
    }
  };

class SaakshiPcmRecorderProcessor extends BaseProcessor {
  private readonly framer = new PcmFrameFramer();
  private stopped = false;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data as { type?: string } | null;
      if (data?.type === "flush") {
        this.stopped = true;
        const lastFrame = this.framer.flush();
        if (lastFrame) {
          const buf = lastFrame.buffer.slice(
            lastFrame.byteOffset,
            lastFrame.byteOffset + lastFrame.byteLength
          );
          this.port.postMessage({ type: "frame", buffer: buf }, [buf]);
        }
        this.port.postMessage({ type: "flushed" });
      }
    };
  }

  override process(inputs: Float32Array[][]): boolean {
    if (this.stopped) {
      return false;
    }
    const channelData = inputs[0]?.[0];
    if (!channelData || channelData.length === 0) {
      return true;
    }

    const frames = this.framer.pushFloat32(channelData, sampleRate);
    for (const frame of frames) {
      const buf = frame.buffer.slice(
        frame.byteOffset,
        frame.byteOffset + frame.byteLength
      );
      this.port.postMessage({ type: "frame", buffer: buf }, [buf]);
    }
    return true;
  }
}

registerProcessor("saakshi-pcm-recorder", SaakshiPcmRecorderProcessor);

