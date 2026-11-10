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
  const {
    status,
    transcript,
    detectedLanguage,
    start,
    stop,
  } = useSttSocket({
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
    if (interactionMode === "hold" && (e.key === " " || e.key === "Enter") && !e.repeat) {
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
    ? "bg-red-600 text-white ring-4 ring-red-300 scale-105"
    : isBusy
      ? "bg-amber-500 text-white cursor-wait"
      : "bg-emerald-600 hover:bg-emerald-700 text-white";

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
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
        className={`flex items-center justify-center gap-3 min-h-[72px] min-w-[220px] px-6 py-4 rounded-full font-semibold text-lg shadow-lg select-none transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400 disabled:opacity-50 ${stateClasses}`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="w-7 h-7 fill-current shrink-0"
        >
          <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a1 1 0 1 1 2 0 7 7 0 0 1-6 6.92V20h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.08A7 7 0 0 1 5 11a1 1 0 1 1 2 0 5 5 0 0 0 10 0z" />
        </svg>
        <span>{currentText}</span>
      </button>
      <span className="sr-only" aria-live="polite">
        {currentText}
      </span>
    </div>
  );
};

