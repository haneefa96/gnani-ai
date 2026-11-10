import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppHeader } from "../../components/AppHeader";
import { Button } from "../../components/Button";
import { TtsPlayer } from "../../voice/TtsPlayer";
import { VoiceButton } from "../../voice/VoiceButton";
import type { SttStatus } from "../../voice/types";
import {
  classifyConfirmation,
  getContractorApiErrorMessage,
  getContractorEntry,
  submitContractorResponse,
  toSupportedLanguage,
  type ContractorEntry,
  type ContractorResult,
} from "../../api";

export default function ContractorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();

  const [entryData, setEntryData] = useState<ContractorEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiceStatus, setVoiceStatus] = useState<SttStatus>("idle");
  const [voiceAudioUri, setVoiceAudioUri] = useState<string | undefined>(
    undefined,
  );
  const [voiceNote, setVoiceNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reasonText, setReasonText] = useState("");
  const [error, setError] = useState("");

  const voiceStatusRef = useRef<SttStatus>("idle");
  const latestAudioUriRef = useRef<string | undefined>(undefined);
  const pendingYesSubmitRef = useRef(false);

  const loadEntry = useCallback(async () => {
    if (!token) {
      setEntryData(null);
      setError(t("contractor:invalidLink"));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      setEntryData(await getContractorEntry(token));
    } catch (requestError) {
      setEntryData(null);
      setError(
        getContractorApiErrorMessage(
          requestError,
          t("contractor:tokenUnavailable"),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    void loadEntry();
  }, [loadEntry]);

  const submitResponse = async (
    result: ContractorResult,
    audioUriOverride?: string,
  ) => {
    if (!token || submitting) return;

    setError("");
    setSubmitting(true);
    try {
      const response = await submitContractorResponse(
        token,
        result,
        result === "dispute" ? reasonText : undefined,
        audioUriOverride ?? latestAudioUriRef.current ?? voiceAudioUri,
      );
      navigate("/contractor/thanks", {
        replace: true,
        state: { result, status: response.status },
      });
    } catch (requestError) {
      setError(
        getContractorApiErrorMessage(
          requestError,
          t("contractor:responseFailed"),
          t("contractor:tokenUnavailable"),
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoiceResponse = async (spokenText: string) => {
    if (!entryData) return;
    setError("");
    setVoiceNote(spokenText);
    const lang = toSupportedLanguage(entryData.language);
    try {
      const classified = await classifyConfirmation(spokenText, lang);
      if (classified.result === "yes") {
        const statusNow = voiceStatusRef.current;
        const stillFinalizing =
          statusNow === "connecting" ||
          statusNow === "recording" ||
          statusNow === "processing";
        if (stillFinalizing && !latestAudioUriRef.current) {
          pendingYesSubmitRef.current = true;
          return;
        }
        await submitResponse("yes", latestAudioUriRef.current);
      } else {
        pendingYesSubmitRef.current = false;
        setDisputeOpen(true);
        setReasonText(spokenText);
      }
    } catch {
      pendingYesSubmitRef.current = false;
      setDisputeOpen(true);
      setReasonText(spokenText);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-600 text-sm">
        {t("common:loading")}
      </div>
    );
  }

  if (!entryData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8 text-center">
          <p role="alert" className="text-rose-700 font-medium mb-2">
            {error || t("contractor:tokenUnavailable")}
          </p>
          <p className="text-sm text-slate-600 mb-6">
            {t("contractor:tokenUnavailableHelp")}
          </p>
          <Button onClick={() => void loadEntry()} variant="secondary">
            {t("common:retry")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50" aria-busy={submitting}>
      <AppHeader title="Saakshi" subtitle={t("contractor:contractorPage")} />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Notice */}
        <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <h3 className="font-semibold text-amber-900 text-sm">
            {t("contractor:noticeTitle")}
          </h3>
          <p className="text-sm text-amber-800 mt-1">
            {t("contractor:noticeDescription")}
          </p>
        </section>

        {/* Entry text */}
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-base font-semibold text-slate-900">
              {t("contractor:workEntry")}
            </h2>
            <span className="text-xs text-slate-500 tabular-nums">
              {t("contractor:entryId", { id: entryData.entry_id })}
            </span>
          </div>
          <p className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 text-slate-800 text-sm whitespace-pre-wrap">
            {entryData.entry_text || "—"}
          </p>
          <p className="text-xs text-slate-500 mt-2.5">
            {t("contractor:language", { lang: entryData.language })}
          </p>
          {entryData.entry_text && (
            <div className="mt-4">
              <TtsPlayer
                text={entryData.entry_text}
                lang={toSupportedLanguage(entryData.language)}
                audience="contractor"
                autoPlay={false}
              />
            </div>
          )}
        </section>

        {/* Voice confirmation response */}
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
          <h3 className="font-semibold text-slate-900 mb-1.5">
            {t("contractor:confirmEntry")}
          </h3>
          <p className="text-sm text-slate-600 mb-5">
            {t("contractor:confirmDescription")}
          </p>

          <VoiceButton
            lang={toSupportedLanguage(entryData.language)}
            mode="confirm"
            kind="confirm"
            label={t("contractor:recordResponse")}
            disabled={submitting}
            onStateChange={(nextStatus) => {
              voiceStatusRef.current = nextStatus;
              setVoiceStatus(nextStatus);
              if (nextStatus === "connecting" || nextStatus === "recording") {
                latestAudioUriRef.current = undefined;
                setVoiceAudioUri(undefined);
                pendingYesSubmitRef.current = false;
              } else if (
                (nextStatus === "idle" || nextStatus === "error") &&
                pendingYesSubmitRef.current
              ) {
                pendingYesSubmitRef.current = false;
                void submitResponse("yes", latestAudioUriRef.current);
              }
            }}
            onAudioSaved={(saved) => {
              latestAudioUriRef.current = saved.audio_ref;
              setVoiceAudioUri(saved.audio_ref);
              if (pendingYesSubmitRef.current) {
                pendingYesSubmitRef.current = false;
                void submitResponse("yes", saved.audio_ref);
              }
            }}
            onTranscript={(spoken) => void handleVoiceResponse(spoken)}
            onError={(err) => setError(err.message)}
          />
          {voiceStatus !== "idle" && (
            <div className="mt-3 text-center">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                {voiceStatus}
              </span>
            </div>
          )}
          {voiceNote && (
            <p className="text-xs text-slate-600 mt-3 italic text-center">
              &ldquo;{voiceNote}&rdquo;
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl mt-4 text-sm"
            >
              {error}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <Button
              onClick={() => void submitResponse("yes")}
              disabled={submitting}
              className="flex-1"
            >
              {t("contractor:tapYes")}
            </Button>
            <Button
              onClick={() => void submitResponse("no")}
              disabled={submitting}
              variant="secondary"
              className="flex-1"
            >
              {t("contractor:tapNo")}
            </Button>
          </div>
        </section>

        {/* Dispute option */}
        <section className="bg-rose-50/70 rounded-2xl border border-rose-200 p-5 sm:p-6">
          <h3 className="font-semibold text-rose-900 mb-2">
            {t("contractor:disputeEntry")}
          </h3>
          {disputeOpen && (
            <label className="block text-sm font-medium text-rose-900 mb-3">
              {t("contractor:disputeReason")}
              <textarea
                value={reasonText}
                onChange={(event) => setReasonText(event.target.value)}
                maxLength={2000}
                rows={3}
                className="w-full px-3.5 py-2.5 border border-rose-300 rounded-xl bg-white text-slate-900 mt-2 focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
              />
            </label>
          )}
          <Button
            onClick={() => {
              if (!disputeOpen) {
                setDisputeOpen(true);
                return;
              }
              void submitResponse("dispute");
            }}
            disabled={submitting}
            variant="danger"
            className="w-full"
          >
            {disputeOpen
              ? t("contractor:submitDispute")
              : t("contractor:tapDispute")}
          </Button>
        </section>
      </main>
    </div>
  );
}
