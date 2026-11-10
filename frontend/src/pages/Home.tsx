import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { Button } from "../components/Button";
import { StatusBadge } from "../components/StatusBadge";
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
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        title="Saakshi"
        subtitle={t("home:worker", { worker: worker.alias })}
        rightSlot={
          <button
            type="button"
            onClick={() => navigate("/settings")}
            aria-label={t("common:settings")}
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="w-5 h-5 fill-none stroke-current"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        }
      />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Hero voice recorder */}
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-7 text-center">
          <h2 className="text-lg sm:text-xl font-semibold text-slate-900 mb-5">
            {t("home:description")}
          </h2>

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
            <div className="mt-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                {extracting ? t("common:loading") : voiceStatus}
              </span>
            </div>
          )}
        </section>

        {voiceError && (
          <div
            role="alert"
            className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm"
          >
            {voiceError}
          </div>
        )}

        {saveNotice && (
          <div
            role="status"
            className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm font-medium"
          >
            {saveNotice}
          </div>
        )}

        {draft && review && (
          <section
            className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-5 sm:p-6 space-y-4"
            aria-labelledby="voice-review-title"
          >
            <div className="flex justify-between items-center">
              <h3
                id="voice-review-title"
                className="font-semibold text-base text-slate-900"
              >
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
                className="text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                {t("common:cancel", "Cancel")}
              </button>
            </div>

            <p className="border-l-4 border-indigo-300 rounded-r-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700 italic">
              &ldquo;{transcript}&rdquo;
            </p>

            {(draft.clarification_question ||
              draft.needs_clarification.length > 0) && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2.5 text-sm">
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
                  <div className="flex flex-wrap items-center gap-2.5">
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
                <span className="font-medium text-slate-700">Work date *</span>
                <input
                  type="date"
                  required
                  value={review.work_date}
                  onChange={(event) =>
                    updateReview("work_date", event.target.value)
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 focus:outline-none"
                />
              </label>
              <label className="text-left">
                <span className="font-medium text-slate-700">Contractor</span>
                <input
                  value={review.counterparty_name}
                  onChange={(event) =>
                    updateReview("counterparty_name", event.target.value)
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 focus:outline-none"
                />
              </label>
              <label className="text-left">
                <span className="font-medium text-slate-700">Work site</span>
                <input
                  value={review.site_name}
                  onChange={(event) =>
                    updateReview("site_name", event.target.value)
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 focus:outline-none"
                />
              </label>
              <label className="text-left">
                <span className="font-medium text-slate-700">Work type</span>
                <input
                  value={review.work_type}
                  onChange={(event) =>
                    updateReview("work_type", event.target.value)
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 focus:outline-none"
                />
              </label>
              <label className="text-left">
                <span className="font-medium text-slate-700">Hours</span>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={review.hours}
                  onChange={(event) =>
                    updateReview("hours", event.target.value)
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 tabular-nums focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 focus:outline-none"
                />
              </label>
              <label className="text-left">
                <span className="font-medium text-slate-700">Days</span>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={review.days}
                  onChange={(event) => updateReview("days", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 tabular-nums focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 focus:outline-none"
                />
              </label>
              <label className="text-left">
                <span className="font-medium text-slate-700">
                  Agreed (INR) *
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={review.agreed_amount_inr}
                  onChange={(event) =>
                    updateReview("agreed_amount_inr", event.target.value)
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 tabular-nums focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 focus:outline-none"
                />
              </label>
              <label className="text-left">
                <span className="font-medium text-slate-700">Paid (INR) *</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={review.paid_amount_inr}
                  onChange={(event) =>
                    updateReview("paid_amount_inr", event.target.value)
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 tabular-nums focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 focus:outline-none"
                />
              </label>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200/80 px-4 py-2.5 text-sm">
              <span className="text-slate-600">Due</span>
              <span className="text-base font-bold text-slate-900 tabular-nums">
                ₹{computedDue}
              </span>
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
        <section className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm text-center">
            <div className="text-lg sm:text-xl font-bold text-indigo-700 tabular-nums">
              {loading || error
                ? "—"
                : t("home:entries", { count: entries.length })}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {t("home:totalEntries")}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm text-center">
            <div className="text-lg sm:text-xl font-bold text-emerald-700 tabular-nums">
              {loading || error || latestDue === undefined
                ? "—"
                : t("home:dueAmount", { amount: latestDue })}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {t("home:latestEntryDue")}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm text-center">
            <div className="text-lg sm:text-xl font-bold text-amber-600 tabular-nums">
              {loading || error
                ? "—"
                : t("home:unconfirmed", { count: unconfirmedCount })}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {t("home:unconfirmedEntries")}
            </div>
          </div>
        </section>

        {/* Recent entries */}
        <section>
          <div className="flex justify-between items-center mb-3 px-1">
            <h3 className="text-base font-semibold text-slate-900">
              {t("home:recentEntries")}
            </h3>
            <button
              type="button"
              onClick={() => navigate("/history")}
              className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
            >
              {t("home:viewAll")}
            </button>
          </div>
          <div
            className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4"
            aria-live="polite"
          >
            {loading ? (
              <div className="text-center text-slate-500 py-8 text-sm">
                {t("common:loading")}
              </div>
            ) : error ? (
              <div className="text-center py-6">
                <p role="alert" className="text-rose-700 text-sm mb-3">
                  {error}
                </p>
                <Button
                  onClick={() => void refresh()}
                  variant="secondary"
                  size="sm"
                >
                  {t("common:retry")}
                </Button>
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center text-slate-500 py-8 text-sm">
                {t("home:noEntriesYet")}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {entries.slice(0, 3).map((entry) => (
                  <div
                    key={entry.id}
                    className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">
                        {entry.site_name || "—"}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 tabular-nums truncate">
                        {entry.work_date} · {entry.counterparty_name || "—"}
                      </div>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <div className="font-semibold text-slate-900 text-sm tabular-nums">
                        {t("home:dueAmount", { amount: entry.due_inr })}
                      </div>
                      <div>
                        <StatusBadge status={entry.status} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Evidence pack */}
        <section>
          <h3 className="text-base font-semibold text-slate-900 mb-3 px-1">
            {t("home:evidencePack")}
          </h3>
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
            <Button onClick={() => navigate("/export")} className="w-full">
              {t("home:generatePack")}
            </Button>
            <p className="text-xs text-slate-500 mt-2.5 text-center">
              {t("home:packDescription")}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
