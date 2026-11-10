import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TtsPlayerProps, TtsQueueItem } from "./types";

export const TtsPlayer: React.FC<TtsPlayerProps> = ({
  text,
  lang,
  voice,
  audience = "worker",
  queue,
  autoPlay = true,
  apiBaseUrl = "",
  replayLabel = "Listen Again",
  stopLabel = "Stop",
  className = "",
  onStart,
  onEnded,
  onError,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const playTokenRef = useRef(0);

  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const items: TtsQueueItem[] = useMemo(() => {
    if (queue && queue.length > 0) {
      return queue;
    }
    if (text && text.trim()) {
      return [{ text: text.trim(), lang, voice, audience }];
    }
    return [];
  }, [queue, text, lang, voice, audience]);

  const itemsKey = useMemo(() => JSON.stringify(items), [items]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const stopPlayback = useCallback(() => {
    playTokenRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setIsLoading(false);
    setIsPlaying(false);
  }, []);

  const playSequence = useCallback(async () => {
    const currentItems = itemsRef.current;
    if (currentItems.length === 0) {
      return;
    }
    stopPlayback();
    const token = playTokenRef.current;
    onStartRef.current?.();

    const base = (apiBaseUrl || import.meta.env.VITE_API_URL || "")
      .trim()
      .replace(/\/+$/, "");
    for (const item of currentItems) {
      if (playTokenRef.current !== token) {
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);

      let blob: Blob;
      try {
        const res = await fetch(`${base}/api/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: item.text,
            lang: item.lang,
            voice: item.voice,
            audience: item.audience ?? audience,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const code = res.status === 429 ? "RATE_LIMITED" : "TTS_FAILED";
          onErrorRef.current?.({
            code,
            message: "Unable to play voice read-back.",
          });
          setIsLoading(false);
          return;
        }
        blob = await res.blob();
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          onErrorRef.current?.({
            code: "TTS_FAILED",
            message: "Unable to play voice read-back.",
          });
        }
        setIsLoading(false);
        return;
      }

      if (playTokenRef.current !== token) {
        return;
      }

      setIsLoading(false);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      setIsPlaying(true);

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          objectUrlRef.current = null;
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          objectUrlRef.current = null;
          onErrorRef.current?.({
            code: "TTS_FAILED",
            message: "Audio playback failed on this device.",
          });
          resolve();
        };
        void audio.play().catch(() => {
          onErrorRef.current?.({
            code: "TTS_FAILED",
            message: "Tap Listen Again to play audio.",
          });
          resolve();
        });
      });
    }

    if (playTokenRef.current === token) {
      setIsPlaying(false);
      onEndedRef.current?.();
    }
  }, [apiBaseUrl, audience, stopPlayback]);

  useEffect(() => {
    if (autoPlay && itemsRef.current.length > 0) {
      void playSequence();
    }
    return () => {
      stopPlayback();
    };
  }, [autoPlay, itemsKey, playSequence, stopPlayback]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => void playSequence()}
        disabled={isLoading}
        aria-busy={isLoading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:opacity-50"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="w-4 h-4 fill-current"
        >
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
        </svg>
        <span>{isLoading ? "Loading audio..." : replayLabel}</span>
      </button>

      {isPlaying && (
        <button
          type="button"
          onClick={stopPlayback}
          className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          {stopLabel}
        </button>
      )}
    </div>
  );
};

