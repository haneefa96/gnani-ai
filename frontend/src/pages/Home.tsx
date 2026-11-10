import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { TtsPlayer } from "../voice/TtsPlayer";
import { VoiceButton } from "../voice/VoiceButton";
import type { SavedAudio, SttStatus } from "../voice/types";
import {
  confirmEntry,
  createEntryDraft,
  extractVoiceEntry,
  getApiErrorMessage,
  toSupportedLanguage,
  type VoiceExtractDraft,
  type WorkerProfile,
} from "../api";
import { notifyEntriesUpdated, useEntries } from "../useEntries";

export default function Home({ worker }: { worker: WorkerProfile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workerLang = toSupportedLanguage(worker.language);

  const [voiceStatus, setVoiceStatus] = useState<SttStatus>("idle");
  const [voiceError, setVoiceError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [savedAudio, setSavedAudio] = useState<SavedAudio | null>(null);
  const [draft, setDraft] = useState<VoiceExtractDraft | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");

  const { entries, loading, error, refresh } = useEntries();
  const unconfirmedCount = entries.filter(
    (entry) => entry.status === "UNCONFIRMED",
  ).length;
  const latestDue = entries[0]?.due_inr;

  const handleVoiceTranscript = async (
    text: string,
    detectedLang: string | null,
  ) => {
    setTranscript(text);
    setVoiceError("");
    setSaveNotice("");
    setExtracting(true);
    const activeLang = toSupportedLanguage(detectedLang || workerLang);
    try {
      const extracted = await extractVoiceEntry(text, activeLang);
      setDraft(extracted);
    } catch (err) {
      setVoiceError(
        getApiErrorMessage(
          err,
          "Could not extract entry details from voice recording.",
        ),
      );
    } finally {
      setExtracting(false);
    }
  };

  const handleClarificationTranscript = async (answerText: string) => {
    if (!draft) return;
    setVoiceError("");
    setExtracting(true);
    try {
      const updated = await extractVoiceEntry(transcript, draft.language, {
        previous_draft: draft,
        clarification_answer: answerText,
        turn_count: 1,
      });
      setDraft(updated);
    } catch (err) {
      setVoiceError(
        getApiErrorMessage(
          err,
          "Could not update draft from clarification answer.",
        ),
      );
    } finally {
      setExtracting(false);
    }
  };

  const handleSaveAndConfirm = async () => {
    if (!draft || !transcript) return;
    setSaving(true);
    setVoiceError("");
    setSaveNotice("");
    try {
      const created = await createEntryDraft({
        audio_ref: savedAudio?.audio_ref || "",
        audio_sha256: savedAudio?.sha256 || "",
        transcript,
        lang: draft.language,
        work_date: draft.work_date,
        site_name: draft.site_name,
        counterparty_name: draft.counterparty_name,
        work_type: draft.work_type,
        hours: draft.hours,
        days: draft.days,
        agreed_inr: draft.agreed_amount_inr,
        paid_inr: draft.paid_amount_inr,
      });
      await confirmEntry(created.id);
      setDraft(null);
      setTranscript("");
      setSavedAudio(null);
      setSaveNotice("Entry saved and confirmed to your ledger.");
      notifyEntriesUpdated();
    } catch (err) {
      setVoiceError(getApiErrorMessage(err, "Could not save wage entry."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">Saakshi</h1>
          <button
            onClick={() => navigate("/settings")}
            className="p-2"
            aria-label={t("common:settings")}
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="container mx-auto p-4">
        <div className="text-center mb-8">
          <h2 className="text-lg mb-4">{t("home:description")}</h2>
          <p className="text-gray-600 text-sm mb-6">
            {t("home:worker", { worker: worker.alias })}
          </p>

          <VoiceButton
            lang={workerLang}
            mode="narration"
            kind="narration"
            label={t("home:recordEntry")}
            onStateChange={setVoiceStatus}
            onAudioSaved={(saved) => setSavedAudio(saved)}
            onTranscript={(text, detectedLang) =>
              void handleVoiceTranscript(text, detectedLang)
            }
            onError={(err) => setVoiceError(err.message)}
          />

          {(voiceStatus !== "idle" || extracting) && (
            <p className="text-xs text-gray-500 mt-2">
              {extracting ? t("common:loading") : voiceStatus}
            </p>
          )}
        </div>

        {voiceError && (
          <div
            role="alert"
            className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm"
          >
            {voiceError}
          </div>
        )}

        {saveNotice && (
          <div className="bg-green-50 text-green-800 p-3 rounded-lg mb-4 text-sm">
            {saveNotice}
          </div>
        )}

        {draft && (
          <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-base">Voice Entry Draft</h3>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setTranscript("");
                  setSavedAudio(null);
                }}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                {t("common:cancel", "Cancel")}
              </button>
            </div>
            <p className="text-xs text-gray-600 italic">
              &ldquo;{transcript}&rdquo;
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">Date:</span> {draft.work_date}
              </div>
              <div>
                <span className="text-gray-500">Site:</span>{" "}
                {draft.site_name || "—"}
              </div>
              <div>
                <span className="text-gray-500">Contractor:</span>{" "}
                {draft.counterparty_name || "—"}
              </div>
              <div>
                <span className="text-gray-500">Hours:</span>{" "}
                {draft.hours ?? "—"}
              </div>
              <div>
                <span className="text-gray-500">Agreed:</span> ₹
                {draft.agreed_amount_inr ?? 0}
              </div>
              <div>
                <span className="text-gray-500">Paid:</span> ₹
                {draft.paid_amount_inr ?? 0}
              </div>
              <div className="col-span-2 font-semibold">
                <span className="text-gray-500 font-normal">Due:</span> ₹
                {draft.due_amount_inr ?? 0}
              </div>
            </div>

            {draft.clarification_question && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-2 text-sm">
                <p className="font-medium text-amber-900">
                  {draft.clarification_question}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <TtsPlayer
                    text={draft.clarification_question}
                    lang={draft.language}
                    audience="worker"
                    autoPlay={false}
                  />
                  <VoiceButton
                    lang={draft.language}
                    mode="confirm"
                    kind="narration"
                    label="Answer by Voice"
                    onTranscript={(ans) =>
                      void handleClarificationTranscript(ans)
                    }
                    onError={(err) => setVoiceError(err.message)}
                  />
                </div>
              </div>
            )}

            <Button
              onClick={() => void handleSaveAndConfirm()}
              disabled={saving || extracting}
              className="w-full"
            >
              {saving ? t("common:loading") : t("common:confirm", "Confirm")}
            </Button>
          </div>
        )}

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow text-center">
            <div className="text-2xl font-bold text-blue-600">
              {loading || error
                ? "—"
                : t("home:entries", { count: entries.length })}
            </div>
            <div className="text-sm text-gray-600">
              {t("home:totalEntries")}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow text-center">
            <div className="text-2xl font-bold text-green-600">
              {loading || error || latestDue === undefined
                ? "—"
                : t("home:dueAmount", { amount: latestDue })}
            </div>
            <div className="text-sm text-gray-600">
              {t("home:latestEntryDue")}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow text-center">
            <div className="text-2xl font-bold text-orange-600">
              {loading || error
                ? "—"
                : t("home:unconfirmed", { count: unconfirmedCount })}
            </div>
            <div className="text-sm text-gray-600">
              {t("home:unconfirmedEntries")}
            </div>
          </div>
        </div>

        {/* Recent entries */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">{t("home:recentEntries")}</h3>
            <button
              onClick={() => navigate("/history")}
              className="text-blue-600 hover:text-blue-800"
            >
              {t("home:viewAll")}
            </button>
          </div>
          <div className="bg-white rounded-lg shadow p-4" aria-live="polite">
            {loading ? (
              <div className="text-center text-gray-500 py-8">
                {t("common:loading")}
              </div>
            ) : error ? (
              <div className="text-center py-6">
                <p role="alert" className="text-red-700 mb-3">
                  {error}
                </p>
                <Button onClick={() => void refresh()} variant="secondary">
                  {t("common:retry")}
                </Button>
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                {t("home:noEntriesYet")}
              </div>
            ) : (
              <div className="space-y-3">
                {entries.slice(0, 3).map((entry) => (
                  <div
                    key={entry.id}
                    className="border-b last:border-b-0 pb-3 last:pb-0"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <div className="font-medium">
                          {entry.site_name || "—"}
                        </div>
                        <div className="text-sm text-gray-600">
                          {entry.work_date} · {entry.counterparty_name || "—"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div>
                          {t("home:dueAmount", { amount: entry.due_inr })}
                        </div>
                        <div className="text-xs text-gray-500">
                          {entry.status}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Evidence pack */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">
            {t("home:evidencePack")}
          </h3>
          <div className="bg-white rounded-lg shadow p-4">
            <Button onClick={() => navigate("/export")} className="w-full">
              {t("home:generatePack")}
            </Button>
            <p className="text-sm text-gray-600 mt-2">
              {t("home:packDescription")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
