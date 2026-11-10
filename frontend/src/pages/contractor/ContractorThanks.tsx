import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthBackdrop } from "../../components/AuthBackdrop";
import { Button } from "../../components/Button";

interface ContractorResultState {
  result?: unknown;
  status?: unknown;
}

export default function ContractorThanks() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const response = location.state as ContractorResultState | null;
  const result =
    response?.result === "yes" ||
    response?.result === "no" ||
    response?.result === "dispute"
      ? response.result
      : null;
  const status = typeof response?.status === "string" ? response.status : null;
  const submission = result && status ? { result, status } : null;

  return (
    <AuthBackdrop>
      <div className="obsidian-card relative w-full rounded-3xl overflow-hidden p-6 sm:p-8 text-center">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
        />
        {submission && (
          <div
            aria-hidden="true"
            className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 flex items-center justify-center shadow-[0_0_24px_-6px_rgba(16,185,129,0.4)]"
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
        )}
        <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">
          {submission
            ? t("contractor:thanksTitle")
            : t("contractor:notSubmittedTitle")}
        </h2>
        <p className="text-sm text-zinc-400 mb-6">
          {submission
            ? t("contractor:recordedStatus", {
                result: t(`contractor:results.${submission.result}`),
                status: submission.status,
              })
            : t("contractor:notSubmittedDescription")}
        </p>
        <Button onClick={() => navigate(-1)} className="w-full">
          {submission ? t("common:back") : t("contractor:returnToEntry")}
        </Button>
      </div>
    </AuthBackdrop>
  );
}
