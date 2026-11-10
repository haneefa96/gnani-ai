import React, { useState } from "react";
import { TtsPlayer } from "./TtsPlayer";
import { VoiceButton } from "./VoiceButton";
import {
  EntryDraft,
  SavedAudio,
  SupportedLanguage,
  VadMode,
  VoiceErrorInfo,
} from "./types";

const LANGUAGES: Array<{ code: SupportedLanguage; label: string }> = [
  { code: "hi-IN", label: "Hindi (hi-IN)" },
  { code: "kn-IN", label: "Kannada (kn-IN)" },
  { code: "bn-IN", label: "Bengali (bn-IN)" },
  { code: "en-IN", label: "English (en-IN)" },
];

export const VoiceTestPage: React.FC = () => {
  const [lang, setLang] = useState<SupportedLanguage>("hi-IN");
  const [mode, setMode] = useState<VadMode>("narration");
  const [transcript, setTranscript] = useState("");
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [savedAudio, setSavedAudio] = useState<SavedAudio | null>(null);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [ttsText, setTtsText] = useState<string | null>(null);
  const [error, setError] = useState<VoiceErrorInfo | null>(null);

  const runExtract = async () => {
    if (!transcript.trim()) {
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/voice/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, lang, context: {} }),
      });
      if (!res.ok) {
        setError({ code: "EXTRACTION_FAILED", message: "Extraction request failed." });
        return;
      }
      const parsed = (await res.json()) as EntryDraft;
      setDraft(parsed);
    } catch {
      setError({ code: "EXTRACTION_FAILED", message: "Extraction request failed." });
    }
  };

  return (
    <main className="max-w-xl mx-auto p-6 space-y-6 text-zinc-100">
      <h1 className="text-2xl font-bold text-white">Voice Pipeline Test Harness</h1>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-300">
          Language
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as SupportedLanguage)}
            className="border border-zinc-800 rounded-xl px-3 py-2 bg-zinc-950 text-zinc-100"
          >
            {LANGUAGES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-300">
          VAD Mode
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as VadMode)}
            className="border border-zinc-800 rounded-xl px-3 py-2 bg-zinc-950 text-zinc-100"
          >
            <option value="narration">narration</option>
            <option value="confirm">confirm</option>
          </select>
        </label>
      </div>

      <VoiceButton
        lang={lang}
        mode={mode}
        kind={mode}
        onTranscript={(txt, det) => {
          setTranscript(txt);
          setDetectedLang(det);
        }}
        onAudioSaved={setSavedAudio}
        onError={setError}
      />

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
          {error.code}: {error.message}
        </div>
      )}

      <section className="space-y-2 p-4 rounded-2xl border border-zinc-800 bg-zinc-900/80">
        <h2 className="font-semibold text-white">Live Transcript</h2>
        <p className="text-zinc-200 min-h-[2rem]">{transcript || "—"}</p>
        <p className="text-xs text-zinc-400">
          Detected language: {detectedLang ?? "—"}
        </p>
        {savedAudio && (
          <p className="text-xs text-zinc-400">
            Saved WAV: {savedAudio.duration_ms} ms (sha256: {savedAudio.sha256.slice(0, 12)}…)
          </p>
        )}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => void runExtract()}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 text-zinc-950 text-sm font-semibold hover:from-cyan-300 hover:to-emerald-300"
          >
            Extract Entry
          </button>
          <button
            type="button"
            onClick={() => setTtsText(transcript || "आज बसवनगुडी साइट पर आठ घंटे काम किया।")}
            className="px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm font-medium hover:bg-zinc-700"
          >
            Speak via TTS
          </button>
        </div>
      </section>

      {ttsText && (
        <TtsPlayer
          text={ttsText}
          lang={lang}
          onError={setError}
        />
      )}

      {draft && (
        <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 text-xs overflow-auto">
          {JSON.stringify(draft, null, 2)}
        </pre>
      )}
    </main>
  );
};

