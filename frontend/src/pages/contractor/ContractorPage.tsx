import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppHeader } from "../../components/AppHeader";
import { AppShell } from "../../components/AppShell";
import { AuthBackdrop } from "../../components/AuthBackdrop";
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
      <AuthBackdrop>
        <div className="obsidian-card rounded-3xl p-8 text-center text-zinc-400 text-sm">
          {t("common:loading")}
        </div>
      </AuthBackdrop>
    );
  }

  if (!entryData) {
    return (
      <AuthBackdrop>
        <div className="obsidian-card w-full rounded-3xl p-6 sm:p-8 text-center">
          <p role="alert" className="text-rose-300 font-medium mb-2">
            {error || t("contractor:tokenUnavailable")}
          </p>
          <p className="text-sm text-zinc-400 mb-6">
            {t("contractor:tokenUnavailableHelp")}
          </p>
          <Button onClick={() => void loadEntry()} variant="secondary">
            {t("common:retry")}
          </Button>
        </div>
      </AuthBackdrop>
    );
  }

  return (
    <AppShell>
      <div aria-busy={submitting}>
        <AppHeader title="Saakshi" subtitle={t("contractor:contractorPage")} />

        <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
          {/* Notice */}
          <section className="animate-fade-up bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
            <h3 className="font-semibold text-amber-300 text-sm">
              {t("contractor:noticeTitle")}
            </h3>
            <p className="text-sm text-amber-100/80 mt-1">
              {t("contractor:noticeDescription")}
            </p>
          </section>

          {/* Entry text */}
          <section className="animate-fade-up obsidian-card rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-base font-semibold text-white">
                {t("contractor:workEntry")}
              </h2>
              <span className="text-xs font-mono text-cyan-300 tabular-nums">
                {t("contractor:entryId", { id: entryData.entry_id })}
              </span>
            </div>
            <p className="rounded-xl bg-zinc-950/90 border border-zinc-800 p-3.5 text-zinc-200 text-sm whitespace-pre-wrap">
              {entryData.entry_text || "—"}
            </p>
            <p className="text-xs text-zinc-400 mt-2.5">
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
          <section className="animate-fade-up obsidian-card rounded-2xl p-5 sm:p-6">
            <h3 className="font-semibold text-white mb-1.5">
              {t("contractor:confirmEntry")}
            </h3>
            <p className="text-sm text-zinc-400 mb-5">
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
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-medium bg-zinc-900 text-cyan-300 border border-zinc-800">
                  {voiceStatus}
                </span>
              </div>
            )}
            {voiceNote && (
              <p className="text-xs text-zinc-300 mt-3 italic text-center">
                &ldquo;{voiceNote}&rdquo;
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded-xl mt-4 text-sm"
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
          <section className="animate-fade-up bg-rose-950/25 rounded-2xl border border-rose-500/30 p-5 sm:p-6">
            <h3 className="font-semibold text-rose-300 mb-2">
              {t("contractor:disputeEntry")}
            </h3>
            {disputeOpen && (
              <label className="block text-sm font-medium text-rose-200 mb-3">
                {t("contractor:disputeReason")}
                <textarea
                  value={reasonText}
                  onChange={(event) => setReasonText(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  className="w-full px-3.5 py-2.5 border border-rose-500/40 rounded-xl bg-zinc-950/90 text-zinc-100 mt-2 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
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
    </AppShell>
  );
}
