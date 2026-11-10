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

interface ReviewForm {
  work_date: string;
  site_name: string;
  counterparty_name: string;
  work_type: string;
  hours: string;
  days: string;
  agreed_amount_inr: string;
  paid_amount_inr: string;
  language: string;
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toReviewForm(
  extracted: VoiceExtractDraft,
  fallbackLang: string,
): ReviewForm {
  return {
    work_date: extracted.work_date ?? "",
    site_name: extracted.site_name ?? "",
    counterparty_name: extracted.counterparty_name ?? "",
    work_type: extracted.work_type ?? "",
    hours: extracted.hours == null ? "" : String(extracted.hours),
    days: extracted.days == null ? "" : String(extracted.days),
    agreed_amount_inr:
      extracted.agreed_amount_inr == null
        ? ""
        : String(extracted.agreed_amount_inr),
    paid_amount_inr:
      extracted.paid_amount_inr == null
        ? ""
        : String(extracted.paid_amount_inr),
    language: extracted.language || fallbackLang,
  };
}

export default function Home({ worker }: { worker: WorkerProfile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workerLang = toSupportedLanguage(worker.language);

  const [voiceStatus, setVoiceStatus] = useState<SttStatus>("idle");
  const [voiceError, setVoiceError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [savedAudio, setSavedAudio] = useState<SavedAudio | null>(null);
  const [draft, setDraft] = useState<VoiceExtractDraft | null>(null);
  const [review, setReview] = useState<ReviewForm | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");

  const { entries, loading, error, refresh } = useEntries();
  const unconfirmedCount = entries.filter(
    (entry) => entry.status === "UNCONFIRMED",
  ).length;
  const latestDue = entries[0]?.due_inr;
  const voiceBusy =
    voiceStatus === "connecting" ||
    voiceStatus === "recording" ||
    voiceStatus === "processing";

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
      setReview(toReviewForm(extracted, activeLang));
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
      setReview(toReviewForm(updated, draft.language));
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

  const updateReview = <K extends keyof ReviewForm>(
    key: K,
    value: ReviewForm[K],
  ) => {
    setReview((current) =>
      current ? { ...current, [key]: value } : current,
    );
  };

  const handleSaveAndConfirm = async () => {
    if (!draft || !review || !transcript) return;
    const agreed = optionalNumber(review.agreed_amount_inr);
    const paid = optionalNumber(review.paid_amount_inr);
    if (
      !review.work_date ||
      agreed === null ||
      paid === null ||
      agreed < 0 ||
      paid < 0
    ) {
      setVoiceError(
        "Enter a work date, agreed wage, and amount paid before confirming.",
      );
      return;
    }
    if (paid > agreed) {
      setVoiceError("Paid amount cannot exceed agreed wage.");
      return;
    }

    setSaving(true);
    setVoiceError("");
    setSaveNotice("");
    try {
      const created = await createEntryDraft({
        audio_ref: savedAudio?.audio_ref || "",
        audio_sha256: savedAudio?.sha256 || "",
        transcript,
        lang: review.language,
        work_date: review.work_date,
        site_name: review.site_name.trim() || null,
        counterparty_name: review.counterparty_name.trim() || null,
        work_type: review.work_type.trim() || null,
        hours: optionalNumber(review.hours),
        days: optionalNumber(review.days),
        agreed_inr: agreed,
        paid_inr: paid,
      });
      await confirmEntry(created.id);
      setDraft(null);
      setReview(null);
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

  const parsedAgreed = review ? optionalNumber(review.agreed_amount_inr) : null;
  const parsedPaid = review ? optionalNumber(review.paid_amount_inr) : null;
  const computedDue =
    parsedAgreed !== null && parsedPaid !== null
      ? Math.max(0, Math.round((parsedAgreed - parsedPaid) * 100) / 100)
      : draft?.due_amount_inr ?? 0;

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
            onStateChange={(nextState) => {
              setVoiceStatus(nextState);
              if (nextState === "connecting" || nextState === "recording") {
                setSavedAudio(null);
              }
            }}
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
          <div
            role="status"
            className="bg-green-50 text-green-800 p-3 rounded-lg mb-4 text-sm"
          >
            {saveNotice}
          </div>
        )}

        {draft && review && (
          <section
            className="bg-white rounded-lg border border-blue-200 shadow p-5 mb-6 space-y-4"
            aria-labelledby="voice-review-title"
          >
            <div className="flex justify-between items-center">
              <h3 id="voice-review-title" className="font-semibold text-base">
                Voice Entry Draft
              </h3>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setReview(null);
                  setTranscript("");
                  setSavedAudio(null);
                  setVoiceError("");
                }}
                disabled={saving}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                {t("common:cancel", "Cancel")}
              </button>
            </div>

            <p className="rounded bg-gray-50 p-3 text-xs text-gray-700 italic">
              &ldquo;{transcript}&rdquo;
            </p>

            {(draft.clarification_question ||
              draft.needs_clarification.length > 0) && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-2 text-sm">
                <p className="font-medium text-amber-900">
                  {draft.clarification_question ||
                    "Please review the details marked for clarification."}
                </p>
                {draft.needs_clarification.length > 0 && (
                  <p className="text-xs text-amber-800">
                    Review fields: {draft.needs_clarification.join(", ")}
                  </p>
                )}
                {draft.clarification_question && (
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
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <label className="text-left">
                <span className="text-gray-600">Work date *</span>
                <input
                  type="date"
                  required
                  value={review.work_date}
                  onChange={(event) =>
                    updateReview("work_date", event.target.value)
                  }
                  className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-gray-900"
                />
              </label>
              <label className="text-left">
                <span className="text-gray-600">Contractor</span>
                <input
                  value={review.counterparty_name}
                  onChange={(event) =>
                    updateReview("counterparty_name", event.target.value)
                  }
                  className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-gray-900"
                />
              </label>
              <label className="text-left">
                <span className="text-gray-600">Work site</span>
                <input
                  value={review.site_name}
                  onChange={(event) =>
                    updateReview("site_name", event.target.value)
                  }
                  className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-gray-900"
                />
              </label>
              <label className="text-left">
                <span className="text-gray-600">Work type</span>
                <input
                  value={review.work_type}
                  onChange={(event) =>
                    updateReview("work_type", event.target.value)
                  }
                  className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-gray-900"
                />
              </label>
              <label className="text-left">
                <span className="text-gray-600">Hours</span>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={review.hours}
                  onChange={(event) =>
                    updateReview("hours", event.target.value)
                  }
                  className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-gray-900"
                />
              </label>
              <label className="text-left">
                <span className="text-gray-600">Days</span>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={review.days}
                  onChange={(event) => updateReview("days", event.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-gray-900"
                />
              </label>
              <label className="text-left">
                <span className="text-gray-600">Agreed (INR) *</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={review.agreed_amount_inr}
                  onChange={(event) =>
                    updateReview("agreed_amount_inr", event.target.value)
                  }
                  className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-gray-900"
                />
              </label>
              <label className="text-left">
                <span className="text-gray-600">Paid (INR) *</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={review.paid_amount_inr}
                  onChange={(event) =>
                    updateReview("paid_amount_inr", event.target.value)
                  }
                  className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-gray-900"
                />
              </label>
            </div>

            <div className="text-sm font-semibold">
              <span className="text-gray-500 font-normal">Due:</span> ₹
              {computedDue}
            </div>

            <Button
              onClick={() => void handleSaveAndConfirm()}
              disabled={saving || extracting || voiceBusy}
              className="w-full"
            >
              {saving ? t("common:loading") : t("common:confirm", "Confirm")}
            </Button>
          </section>
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
