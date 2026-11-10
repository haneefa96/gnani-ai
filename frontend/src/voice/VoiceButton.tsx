import React, { useEffect, useRef } from "react";
import { VoiceButtonProps } from "./types";
import { useSttSocket } from "./useSttSocket";

export const VoiceButton: React.FC<VoiceButtonProps> = ({
  lang,
  mode = "narration",
  kind = "narration",
  keyterms,
  disabled = false,
  interactionMode = "hold",
  label = "Hold to Speak",
  recordingLabel = "Listening... Release to send",
  processingLabel = "Processing...",
  className = "",
  onTranscript,
  onAudioSaved,
  onError,
  onStateChange,
}) => {
  const { status, transcript, detectedLanguage, start, stop } = useSttSocket({
    lang,
    mode,
    kind,
    keyterms,
    onAudioSaved,
    onError,
  });

  const holdingRef = useRef(false);
  const lastDeliveredRef = useRef("");

  useEffect(() => {
    onStateChange?.(status);
  }, [status, onStateChange]);

  useEffect(() => {
    if (!transcript) {
      lastDeliveredRef.current = "";
      return;
    }
    if (transcript !== lastDeliveredRef.current) {
      lastDeliveredRef.current = transcript;
      onTranscript?.(transcript, detectedLanguage);
    }
  }, [transcript, detectedLanguage, onTranscript]);

  const isActive = status === "recording" || status === "connecting";
  const isBusy = status === "processing";

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || isBusy || interactionMode !== "hold") {
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointer events may not have an active pointer id.
    }
    holdingRef.current = true;
    void start();
  };

  const handlePointerRelease = () => {
    if (interactionMode !== "hold" || !holdingRef.current) {
      return;
    }
    holdingRef.current = false;
    void stop();
  };

  const handleClick = () => {
    if (disabled || isBusy || interactionMode !== "toggle") {
      return;
    }
    if (isActive) {
      void stop();
    } else {
      void start();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || isBusy) {
      return;
    }
    if (
      interactionMode === "hold" &&
      (e.key === " " || e.key === "Enter") &&
      !e.repeat
    ) {
      e.preventDefault();
      if (!isActive) {
        holdingRef.current = true;
        void start();
      }
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (interactionMode === "hold" && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      if (holdingRef.current) {
        holdingRef.current = false;
        void stop();
      }
    }
  };

  const currentText = isBusy
    ? processingLabel
    : isActive
      ? recordingLabel
      : label;

  const stateClasses = isActive
    ? "bg-rose-600 text-white ring-4 ring-rose-500/35 shadow-[0_0_32px_-4px_rgba(244,63,94,0.65)] scale-[1.03]"
    : isBusy
      ? "bg-amber-400 text-zinc-950 shadow-[0_0_24px_-4px_rgba(251,191,36,0.5)] cursor-wait"
      : "bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 active:scale-[0.98] text-zinc-950 shadow-[0_0_36px_-6px_rgba(34,211,238,0.55)]";

  return (
    <div className={`relative flex flex-col items-center gap-3 ${className}`}>
      <div className="relative inline-flex items-center justify-center">
        {isActive && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-2 rounded-full bg-rose-500/25 animate-ping"
          />
        )}
        <button
          type="button"
          disabled={disabled || isBusy}
          aria-pressed={isActive}
          aria-label={currentText}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerRelease}
          onPointerCancel={handlePointerRelease}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          style={{ touchAction: "none" }}
          className={`relative flex items-center justify-center gap-3 min-h-[68px] min-w-[236px] px-7 py-4 rounded-full font-semibold text-base sm:text-lg select-none transition-all duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/50 disabled:opacity-50 ${stateClasses}`}
        >
          {isBusy ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="w-6 h-6 animate-spin fill-none stroke-current shrink-0"
              strokeWidth={2.5}
            >
              <circle cx="12" cy="12" r="9" className="opacity-25" />
              <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="w-7 h-7 fill-current shrink-0"
            >
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a1 1 0 1 1 2 0 7 7 0 0 1-6 6.92V20h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.08A7 7 0 0 1 5 11a1 1 0 1 1 2 0 5 5 0 0 0 10 0z" />
            </svg>
          )}
          <span>{currentText}</span>
        </button>
      </div>
      {isActive && (
        <div aria-hidden="true" className="flex items-center gap-1 h-5">
          {[0, 120, 240, 120, 0].map((delay, idx) => (
            <span
              key={idx}
              style={{ animationDelay: `${delay}ms` }}
              className="w-1 h-4 rounded-full bg-rose-400 animate-wave-bar"
            />
          ))}
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {currentText}
      </span>
    </div>
  );
};
