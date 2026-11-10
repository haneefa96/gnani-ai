import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { AppShell } from "../components/AppShell";
import { Button } from "../components/Button";
import {
  ApiError,
  EvidencePackResponse,
  VerificationResult,
  downloadEvidenceFile,
  generateEvidencePack,
  verifyLedgerChain,
} from "../lib/evidenceApi";

type VerifyState = "loading" | "valid" | "invalid" | "auth_error" | "error";
type PackState =
  "idle" | "loading" | "success" | "empty" | "auth_error" | "error";

export default function ExportScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");

  const [verifyState, setVerifyState] = useState<VerifyState>("loading");
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(
    null,
  );
  const [verifyError, setVerifyError] = useState("");

  const [packState, setPackState] = useState<PackState>("idle");
  const [pack, setPack] = useState<EvidencePackResponse | null>(null);
  const [packError, setPackError] = useState("");

  const [downloading, setDownloading] = useState<"pdf" | "zip" | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const [downloadNotice, setDownloadNotice] = useState("");

  const runVerification = useCallback(async () => {
    setVerifyState("loading");
    setVerifyError("");
    try {
      const result = await verifyLedgerChain();
      setVerifyResult(result);
      setVerifyState(result.valid ? "valid" : "invalid");
    } catch (err) {
      setVerifyResult(null);
      if (err instanceof ApiError && err.isAuthError) {
        setVerifyState("auth_error");
        setVerifyError(err.message);
      } else {
        setVerifyState("error");
        setVerifyError(
          err instanceof Error
            ? err.message
            : "Unable to verify ledger integrity.",
        );
      }
    }
  }, []);

  useEffect(() => {
    void runVerification();
  }, [runVerification]);

  const handleGenerate = async () => {
    if (!periodFrom || !periodTo) {
      setPackState("error");
      setPackError(t("export:enterPeriod"));
      return;
    }
    if (periodFrom > periodTo) {
      setPackState("error");
      setPackError(
        t(
          "export:invalidDateRange",
          "Start date must be on or before end date.",
        ),
      );
      return;
    }

    setPackState("loading");
    setPack(null);
    setPackError("");
    setDownloadError("");
    setDownloadNotice("");

    try {
      const created = await generateEvidencePack(periodFrom, periodTo);
      setPack(created);
      setPackState("success");
      void runVerification();
    } catch (err) {
      setPack(null);
      if (err instanceof ApiError) {
        if (err.isAuthError) {
          setPackState("auth_error");
          setPackError(err.message);
        } else if (err.isEmpty) {
          setPackState("empty");
          setPackError(err.message);
        } else {
          setPackState("error");
          setPackError(err.message);
        }
      } else {
        setPackState("error");
        setPackError(
          err instanceof Error
            ? err.message
            : t("export:generateFailed", "Failed to generate evidence pack."),
        );
      }
    }
  };

  const handleDownload = async (kind: "pdf" | "zip") => {
    if (!pack) {
      return;
    }
    const url =
      kind === "pdf"
        ? pack.pdf_download_url || `/api/evidence/${pack.pack_id}/pdf`
        : pack.zip_download_url || `/api/evidence/${pack.pack_id}/zip`;
    const fallbackName = `evidence_pack_${pack.pack_id}.${kind}`;

    setDownloading(kind);
    setDownloadError("");
    setDownloadNotice("");

    try {
      const savedAs = await downloadEvidenceFile(url, fallbackName);
      setDownloadNotice(
        t("export:downloadStarted", {
          defaultValue: "Downloaded {{filename}}",
          filename: savedAs,
        }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.isAuthError) {
        setPack(null);
        setPackState("auth_error");
        setPackError(err.message);
      } else {
        setDownloadError(
          err instanceof Error
            ? err.message
            : t("export:downloadFailed", "Failed to download file."),
        );
      }
    } finally {
      setDownloading(null);
    }
  };

  const isAuthBlocked =
    verifyState === "auth_error" || packState === "auth_error";

  return (
    <AppShell>
      <AppHeader
        title={t("export:title")}
        onBack={() => navigate("/home")}
        backLabel={t("common:back")}
        showNav
      />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Hash Chain Verification Card */}
        <section className="animate-fade-up obsidian-card rounded-2xl p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-white">
              {t("export:verificationTitle", "Ledger Hash-Chain Verification")}
            </h2>
            <button
              type="button"
              onClick={() => void runVerification()}
              disabled={verifyState === "loading"}
              className="text-sm font-medium text-cyan-400 hover:text-cyan-300 disabled:text-zinc-600 transition-colors"
            >
              {t("export:recheckVerification", "Recheck")}
            </button>
          </div>

          {verifyState === "loading" && (
            <p
              data-testid="verify-loading"
              className="text-sm text-zinc-400 mt-2.5"
            >
              {t("export:verifyingChain", "Verifying hash chain integrity...")}
            </p>
          )}

          {verifyState === "valid" && (
            <div
              data-testid="verify-valid"
              className="mt-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm"
            >
              <span className="font-semibold">
                {t("export:chainValid", "Hash chain verified intact")}
              </span>
              {typeof verifyResult?.checked_entries === "number" && (
                <span> ({verifyResult.checked_entries} entries)</span>
              )}
              {verifyResult?.message && (
                <div className="text-xs text-emerald-300/80 mt-1">
                  {verifyResult.message}
                </div>
              )}
            </div>
          )}

          {verifyState === "invalid" && (
            <div
              data-testid="verify-invalid"
              className="mt-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm"
            >
              <div className="font-semibold">
                {t("export:chainInvalid", "Hash chain verification failed")}
              </div>
              {verifyResult?.mismatch_reason && (
                <div className="text-xs mt-1">
                  {verifyResult.mismatch_reason}
                </div>
              )}
            </div>
          )}

          {verifyState === "error" && (
            <div
              data-testid="verify-error"
              className="mt-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm"
            >
              {verifyError}
            </div>
          )}
        </section>

        {/* Auth Error State */}
        {isAuthBlocked && (
          <div
            data-testid="auth-error"
            role="alert"
            className="bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-2xl p-5 space-y-3"
          >
            <p className="font-semibold">
              {t(
                "export:authRequired",
                "Authentication required or session expired.",
              )}
            </p>
            <p className="text-sm">{packError || verifyError}</p>
            <Button
              onClick={() => navigate("/login")}
              variant="primary"
              size="sm"
            >
              {t("onboarding:login", "Login")}
            </Button>
          </div>
        )}

        {/* Success Card with Real Downloads */}
        {packState === "success" && pack && (
          <section
            data-testid="pack-success"
            className="animate-fade-up obsidian-card rounded-2xl p-6 text-center space-y-4"
          >
            <div
              aria-hidden="true"
              className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 flex items-center justify-center shadow-[0_0_24px_-6px_rgba(16,185,129,0.4)]"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-7 h-7 fill-none stroke-current"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              {t("export:generated")}
            </h2>
            <p className="text-sm text-zinc-400">{t("export:packGenerated")}</p>

            <div className="text-left bg-zinc-950/90 border border-zinc-800 rounded-xl p-3.5 text-xs text-zinc-300 space-y-1.5">
              <div>
                <span className="font-semibold text-zinc-200">Entries:</span>{" "}
                <span className="tabular-nums font-mono text-cyan-300">
                  {pack.entry_count}
                </span>
              </div>
              <div className="break-all">
                <span className="font-semibold text-zinc-200">
                  Chain Head Hash:
                </span>{" "}
                <code className="font-mono text-emerald-300">
                  {pack.chain_head_hash || "NONE"}
                </code>
              </div>
            </div>

            {downloadError && (
              <div
                data-testid="download-error"
                role="alert"
                className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded-xl text-sm"
              >
                {downloadError}
              </div>
            )}

            {downloadNotice && (
              <div
                data-testid="download-notice"
                className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-3 rounded-xl text-sm"
              >
                {downloadNotice}
              </div>
            )}

            <div className="space-y-2.5 pt-1">
              <Button
                onClick={() => void handleDownload("pdf")}
                disabled={downloading !== null}
                className="w-full"
              >
                {downloading === "pdf"
                  ? t("common:loading")
                  : t("export:downloadPDF")}
              </Button>
              <Button
                onClick={() => void handleDownload("zip")}
                disabled={downloading !== null}
                variant="secondary"
                className="w-full"
              >
                {downloading === "zip"
                  ? t("common:loading")
                  : t("export:downloadZIP")}
              </Button>
            </div>

            <Button
              onClick={() => {
                setPackState("idle");
                setPack(null);
                setDownloadError("");
                setDownloadNotice("");
              }}
              variant="secondary"
              className="w-full"
            >
              {t("common:back")}
            </Button>
          </section>
        )}

        {/* Period Selection & Generation Form */}
        {packState !== "success" && (
          <section className="animate-fade-up obsidian-card rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-1.5">
              {t("export:generatePack")}
            </h2>
            <p className="text-sm text-zinc-400 mb-6">
              {t("export:periodDescription")}
            </p>

            {packState === "empty" && (
              <div
                data-testid="export-empty"
                role="status"
                className="mb-4 p-4 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm"
              >
                {packError ||
                  t(
                    "export:noEntriesInPeriod",
                    "No wage entries found for this date range.",
                  )}
              </div>
            )}

            {packState === "error" && (
              <div
                data-testid="export-error"
                role="alert"
                className="mb-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm"
              >
                {packError}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="period-from"
                  className="block text-sm font-medium text-zinc-300 mb-1.5"
                >
                  {t("export:periodFrom")}
                </label>
                <input
                  id="period-from"
                  type="date"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950/90 text-zinc-100 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="period-to"
                  className="block text-sm font-medium text-zinc-300 mb-1.5"
                >
                  {t("export:periodTo")}
                </label>
                <input
                  id="period-to"
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950/90 text-zinc-100 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 focus:outline-none"
                />
              </div>
            </div>

            <Button
              onClick={() => void handleGenerate()}
              disabled={packState === "loading"}
              className="w-full mt-6"
            >
              {packState === "loading"
                ? t("common:loading")
                : t("export:generate")}
            </Button>

            <div className="mt-6 pt-5 border-t border-white/[0.08]">
              <h3 className="text-sm font-semibold text-white mb-2">
                {t("export:whatIsIncluded")}
              </h3>
              <ul className="list-disc list-inside text-sm text-zinc-400 space-y-1">
                <li>{t("export:includedPDF")}</li>
                <li>{t("export:includedAudio")}</li>
                <li>{t("export:includedManifest")}</li>
                <li>{t("export:includedVerification")}</li>
              </ul>
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}
