/**
 * Typed frontend contracts for Developer A's voice components and hooks.
 * Developer B's screens import these types; Developer A never imports from B's folders.
 */

export const ERROR_CODES = [
  "RATE_LIMITED",
  "MIC_DENIED",
  "STT_TIMEOUT",
  "STT_CONNECTION_LOST",
  "TTS_FAILED",
  "EXTRACTION_FAILED",
  "UNSUPPORTED_LANGUAGE",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type SupportedLanguage = "hi-IN" | "kn-IN" | "bn-IN" | "en-IN";
export type VadMode = "narration" | "confirm";
export type AudioKind = "narration" | "confirm" | "consent" | "dispute";
export type ConfirmationResult = "yes" | "no" | "unclear";
export type TtsAudience = "worker" | "contractor";

export type SttStatus =
  | "idle"
  | "connecting"
  | "recording"
  | "processing"
  | "error";

export interface SavedAudio {
  audio_ref: string;
  sha256: string;
  duration_ms: number;
}

export interface SttTranscriptEvent {
  type: "transcript";
  text: string;
  detected_language_code: SupportedLanguage | string;
  segment_index: number;
  latency_ms: number;
}

export interface SttProcessingEvent {
  type: "processing";
}

export interface SttAudioSavedEvent extends SavedAudio {
  type: "audio_saved";
}

export interface SttErrorEvent {
  type: "error";
  code: ErrorCode;
  message: string;
}

export type SttServerMessage =
  | SttTranscriptEvent
  | SttProcessingEvent
  | SttAudioSavedEvent
  | SttErrorEvent;

export interface VoiceErrorInfo {
  code: ErrorCode;
  message: string;
}

export interface EntryDraft {
  work_date: string;
  site_name: string | null;
  counterparty_name: string | null;
  work_type: string | null;
  hours: number | null;
  days: number | null;
  agreed_amount_inr: number | null;
  paid_amount_inr: number | null;
  due_amount_inr: number | null;
  stated_due_amount_inr?: number | null;
  field_confidence: Record<string, number>;
  needs_clarification: string[];
  clarification_question: string | null;
  language: SupportedLanguage;
  manual_correction_required?: boolean;
}

export interface UseSttSocketOptions {
  lang: SupportedLanguage;
  mode: VadMode;
  kind: AudioKind;
  keyterms?: string[];
  wsBaseUrl?: string;
  maxReconnectAttempts?: number;
  onTranscript?: (event: SttTranscriptEvent) => void;
  onAudioSaved?: (saved: SavedAudio) => void;
  onError?: (error: VoiceErrorInfo) => void;
}

export interface UseSttSocketReturn {
  status: SttStatus;
  transcript: string;
  segments: SttTranscriptEvent[];
  detectedLanguage: string | null;
  savedAudio: SavedAudio | null;
  error: VoiceErrorInfo | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
}

export interface VoiceButtonProps {
  lang: SupportedLanguage;
  mode?: VadMode;
  kind?: AudioKind;
  keyterms?: string[];
  disabled?: boolean;
  interactionMode?: "hold" | "toggle";
  label?: string;
  recordingLabel?: string;
  processingLabel?: string;
  className?: string;
  onTranscript?: (transcript: string, detectedLang: string | null) => void;
  onAudioSaved?: (saved: SavedAudio) => void;
  onError?: (error: VoiceErrorInfo) => void;
  onStateChange?: (status: SttStatus) => void;
}

export interface TtsQueueItem {
  id?: string;
  text: string;
  lang: SupportedLanguage;
  voice?: string;
  audience?: TtsAudience;
}

export interface TtsPlayerProps {
  text?: string | null;
  lang: SupportedLanguage;
  voice?: string;
  audience?: TtsAudience;
  queue?: TtsQueueItem[];
  autoPlay?: boolean;
  apiBaseUrl?: string;
  replayLabel?: string;
  stopLabel?: string;
  className?: string;
  onStart?: () => void;
  onEnded?: () => void;
  onError?: (error: VoiceErrorInfo) => void;
}

