import axios, { type InternalAxiosRequestConfig } from "axios";
import type { SupportedLanguage } from "./voice/types";

const ACCESS_TOKEN_KEY = "saakshi_access_token";
const PROFILE_KEY = "saakshi_worker_profile";
const LEGACY_WORKER_KEY = "saakshi_worker";

export const AUTH_EXPIRED_EVENT = "saakshi:auth-expired";

export interface AuthResponse {
  access_token: string;
  token_type: "bearer";
  worker_id: number;
  language?: string;
}

export const SUPPORTED_LANGUAGE_OPTIONS = [
  { code: "hi-IN", name: "Hindi" },
  { code: "kn-IN", name: "Kannada" },
  { code: "bn-IN", name: "Bengali" },
  { code: "en-IN", name: "English" },
] as const;

export interface WorkerProfile {
  alias: string;
  language: string;
}

export interface WageEntry {
  id: number;
  work_date: string;
  site_name: string | null;
  counterparty_name: string | null;
  work_type?: string | null;
  hours: number | null;
  days: number | null;
  agreed_inr: number;
  paid_inr: number;
  due_inr: number;
  language: string;
  transcript: string | null;
  status: string;
  created_at: string;
}

export interface VoiceDraftReview {
  draft_token: string
  transcript: string
  work_date: string | null
  site_name: string | null
  counterparty_name: string | null
  work_type: string | null
  hours: number | null
  days: number | null
  agreed_amount_inr: number | null
  paid_amount_inr: number | null
  due_amount_inr: number | null
  language: string
  detected_language_code: string | null
  field_confidence: Record<string, number>
  needs_clarification: string[]
  clarification_question: string | null
  voice_mode: 'fake' | 'gnani'
}

export interface VoiceDraftConfirmation {
  work_date: string
  site_name: string | null
  counterparty_name: string | null
  work_type: string | null
  hours: number | null
  days: number | null
  agreed_amount_inr: number
  paid_amount_inr: number
  language: string
}

export interface ContractorEntry {
  entry_text: string;
  language: string;
  entry_id: number;
}

export type ContractorResult = "yes" | "no" | "dispute";

export interface ContractorResponse {
  status: string;
}

interface StoredProfile {
  alias?: unknown;
  language?: unknown;
}

export const API_BASE_URL = (import.meta.env.VITE_API_URL || "")
  .trim()
  .replace(/\/+$/, "");

export function resolveApiUrl(path: string): string {
  if (!API_BASE_URL || /^https?:\/\//i.test(path)) {
    return path;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

export const api = axios.create({ baseURL: resolveApiUrl("/api") });

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function isJwtExpired(token: string): boolean {
  try {
    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return true;

    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    ) as {
      exp?: unknown;
    };

    return typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export function storeAuthSession(token: string, profile: WorkerProfile): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  localStorage.removeItem(LEGACY_WORKER_KEY);
}

export function restoreAuthSession(): WorkerProfile | null {
  localStorage.removeItem(LEGACY_WORKER_KEY);
  const token = getAccessToken();

  if (!token || isJwtExpired(token)) {
    clearAuthSession();
    return null;
  }

  const storedProfile = localStorage.getItem(PROFILE_KEY);
  if (!storedProfile) return { alias: "Worker", language: "hi-IN" };

  try {
    const profile = JSON.parse(storedProfile) as StoredProfile;
    return {
      alias: typeof profile.alias === "string" ? profile.alias : "Worker",
      language:
        typeof profile.language === "string" ? profile.language : "hi-IN",
    };
  } catch {
    localStorage.removeItem(PROFILE_KEY);
    return { alias: "Worker", language: "hi-IN" };
  }
}

export function clearAuthSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(LEGACY_WORKER_KEY);
}

export async function registerWorker(
  alias: string,
  pin: string,
  language: string,
): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>("/auth/register", {
    alias,
    pin,
    language,
  });
  return response.data;
}

export async function loginWorker(
  alias: string,
  pin: string,
): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>("/auth/login", { alias, pin });
  return response.data;
}

export async function changeWorkerPin(
  currentPin: string,
  newPin: string,
): Promise<void> {
  await api.post("/auth/change-pin", {
    current_pin: currentPin,
    new_pin: newPin,
  });
}

export async function updateWorkerLanguage(
  language: string,
): Promise<{ language: string }> {
  const response = await api.patch<{ language: string }>("/auth/language", {
    language,
  });
  return response.data;
}

export async function getEntries(): Promise<WageEntry[]> {
  const response = await api.get<WageEntry[]>("/entries/");
  if (!Array.isArray(response.data)) {
    throw new Error("Unexpected entries response");
  }
  return response.data;
}

export async function createVoiceDraft(audio: Blob): Promise<VoiceDraftReview> {
  const response = await api.post<VoiceDraftReview>("/entries/draft", audio, {
    headers: { "Content-Type": audio.type || "application/octet-stream" },
  });
  return response.data;
}

export async function confirmVoiceDraft(
  draft: VoiceDraftReview,
  audio: Blob,
  confirmation: VoiceDraftConfirmation,
): Promise<WageEntry> {
  const bytes = new Uint8Array(await audio.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  const response = await api.post<WageEntry>("/entries/draft/confirm", {
    draft_token: draft.draft_token,
    audio_base64: btoa(binary),
    ...confirmation,
  });
  return response.data;
}

export async function getContractorEntry(
  token: string,
): Promise<ContractorEntry> {
  const response = await api.get<ContractorEntry>(
    `/contractor/${encodeURIComponent(token)}`,
  );
  return response.data;
}

export async function submitContractorResponse(
  token: string,
  result: ContractorResult,
  reasonText?: string,
  reasonAudioUri?: string,
): Promise<ContractorResponse> {
  const response = await api.post<ContractorResponse>(
    `/contractor/${encodeURIComponent(token)}/respond`,
    {
      result,
      ...(result === "dispute" && reasonText?.trim()
        ? { reason_text: reasonText.trim() }
        : {}),
      ...(reasonAudioUri ? { reason_audio_uri: reasonAudioUri } : {}),
    },
  );
  return response.data;
}

export interface VoiceExtractDraft {
  work_date: string;
  site_name: string | null;
  counterparty_name: string | null;
  work_type: string | null;
  hours: number | null;
  days: number | null;
  agreed_amount_inr: number | null;
  paid_amount_inr: number | null;
  due_amount_inr: number | null;
  stated_due_amount_inr: number | null;
  needs_clarification: string[];
  clarification_question: string | null;
  language: SupportedLanguage;
  manual_correction_required: boolean;
}

export interface CreateEntryDraftPayload {
  audio_ref: string;
  audio_sha256?: string;
  transcript: string;
  lang: string;
  work_date?: string;
  site_name?: string | null;
  counterparty_name?: string | null;
  work_type?: string | null;
  hours?: number | null;
  days?: number | null;
  agreed_inr?: number | null;
  paid_inr?: number | null;
}

export function toSupportedLanguage(lang?: string | null): SupportedLanguage {
  if (
    lang === "hi-IN" ||
    lang === "kn-IN" ||
    lang === "bn-IN" ||
    lang === "en-IN"
  ) {
    return lang;
  }
  return "hi-IN";
}

export async function extractVoiceEntry(
  transcript: string,
  lang: SupportedLanguage,
  context: Record<string, unknown> = {},
): Promise<VoiceExtractDraft> {
  const response = await api.post<VoiceExtractDraft>("/voice/extract", {
    transcript,
    lang,
    context,
  });
  return response.data;
}

export async function createEntryDraft(
  payload: CreateEntryDraftPayload,
): Promise<WageEntry> {
  const response = await api.post<WageEntry>("/entries/draft", payload);
  return response.data;
}

export async function confirmEntry(entryId: number): Promise<WageEntry> {
  const response = await api.post<WageEntry>(`/entries/${entryId}/confirm`);
  return response.data;
}

export async function shareEntry(entryId: number): Promise<{ share_url: string }> {
  const response = await api.post<{ share_url: string }>(`/entries/${entryId}/share`);
  return response.data;
}

export async function classifyConfirmation(
  transcript: string,
  lang: SupportedLanguage,
): Promise<{ result: "yes" | "no" | "unclear" }> {
  const response = await api.post<{ result: "yes" | "no" | "unclear" }>(
    "/voice/classify-confirmation",
    { transcript, lang },
  );
  return response.data;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ detail?: unknown }>(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
  }

  return fallback;
}

export function getContractorApiErrorMessage(
  error: unknown,
  fallback: string,
  unavailableFallback = fallback,
): string {
  if (axios.isAxiosError(error) && error.response?.status === 404) {
    return unavailableFallback;
  }
  return getApiErrorMessage(error, fallback);
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const isContractorRequest = config.url?.startsWith("/contractor/") ?? false;
  const token = isContractorRequest ? null : getAccessToken();
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  } else if (isContractorRequest) {
    config.headers.delete("Authorization");
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      error.config?.url !== "/auth/login" &&
      error.config?.url !== "/auth/register"
    ) {
      clearAuthSession();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      }
    }

    return Promise.reject(error);
  },
);
