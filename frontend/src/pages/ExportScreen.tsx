import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">{t("export:title")}</h1>
          <button
            onClick={() => navigate("/home")}
            className="p-2"
            aria-label={t("common:back")}
          >
            ←
          </button>
        </div>
      </div>

      <div className="container mx-auto p-4 space-y-4">
        {/* Hash Chain Verification Card */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold">
              {t("export:verificationTitle", "Ledger Hash-Chain Verification")}
            </h2>
            <button
              type="button"
              onClick={() => void runVerification()}
              disabled={verifyState === "loading"}
              className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
            >
              {t("export:recheckVerification", "Recheck")}
            </button>
          </div>

          {verifyState === "loading" && (
            <p
              data-testid="verify-loading"
              className="text-sm text-gray-600 mt-2"
            >
              {t("export:verifyingChain", "Verifying hash chain integrity...")}
            </p>
          )}

          {verifyState === "valid" && (
            <div
              data-testid="verify-valid"
              className="mt-2 p-3 rounded bg-green-50 text-green-800 text-sm"
            >
              <span className="font-medium">
                {t("export:chainValid", "Hash chain verified intact")}
              </span>
              {typeof verifyResult?.checked_entries === "number" && (
                <span> ({verifyResult.checked_entries} entries)</span>
              )}
              {verifyResult?.message && (
                <div className="text-xs text-green-700 mt-1">
                  {verifyResult.message}
                </div>
              )}
            </div>
          )}

          {verifyState === "invalid" && (
            <div
              data-testid="verify-invalid"
              className="mt-2 p-3 rounded bg-red-50 text-red-800 text-sm"
            >
              <div className="font-medium">
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
              className="mt-2 p-3 rounded bg-red-50 text-red-700 text-sm"
            >
              {verifyError}
            </div>
          )}
        </div>

        {/* Auth Error State */}
        {isAuthBlocked && (
          <div
            data-testid="auth-error"
            role="alert"
            className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 space-y-3"
          >
            <p className="font-medium">
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
          <div
            data-testid="pack-success"
            className="bg-white rounded-lg shadow-lg p-6 text-center space-y-4"
          >
            <div className="text-5xl">✓</div>
            <h2 className="text-2xl font-bold">{t("export:generated")}</h2>
            <p className="text-gray-600">{t("export:packGenerated")}</p>

            <div className="text-left bg-gray-50 rounded p-3 text-xs text-gray-700 space-y-1">
              <div>
                <span className="font-medium">Entries:</span> {pack.entry_count}
              </div>
              <div className="break-all">
                <span className="font-medium">Chain Head Hash:</span>{" "}
                <code>{pack.chain_head_hash || "NONE"}</code>
              </div>
            </div>

            {downloadError && (
              <div
                data-testid="download-error"
                role="alert"
                className="bg-red-50 text-red-700 p-3 rounded text-sm"
              >
                {downloadError}
              </div>
            )}

            {downloadNotice && (
              <div
                data-testid="download-notice"
                className="bg-green-50 text-green-800 p-3 rounded text-sm"
              >
                {downloadNotice}
              </div>
            )}

            <div className="space-y-2">
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
          </div>
        )}

        {/* Period Selection & Generation Form */}
        {packState !== "success" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">
              {t("export:generatePack")}
            </h2>
            <p className="text-gray-600 mb-6">
              {t("export:periodDescription")}
            </p>

            {packState === "empty" && (
              <div
                data-testid="export-empty"
                role="status"
                className="mb-4 p-4 rounded-lg bg-gray-100 text-gray-700 text-sm"
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
                className="mb-4 p-4 rounded-lg bg-red-50 text-red-700 text-sm"
              >
                {packError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="period-from"
                  className="block text-sm font-medium mb-2"
                >
                  {t("export:periodFrom")}
                </label>
                <input
                  id="period-from"
                  type="date"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  className="w-full p-3 border rounded-lg"
                />
              </div>
              <div>
                <label
                  htmlFor="period-to"
                  className="block text-sm font-medium mb-2"
                >
                  {t("export:periodTo")}
                </label>
                <input
                  id="period-to"
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  className="w-full p-3 border rounded-lg"
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

            <div className="mt-6">
              <h3 className="font-semibold mb-2">
                {t("export:whatIsIncluded")}
              </h3>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>{t("export:includedPDF")}</li>
                <li>{t("export:includedAudio")}</li>
                <li>{t("export:includedManifest")}</li>
                <li>{t("export:includedVerification")}</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
