import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AuthBackdrop } from "../../components/AuthBackdrop";
import { Button } from "../../components/Button";
import {
  getApiErrorMessage,
  registerWorker,
  SUPPORTED_LANGUAGE_OPTIONS,
  type AuthResponse,
  type WorkerProfile,
} from "../../api";

export default function Onboarding({
  onLogin,
}: {
  onLogin: (response: AuthResponse, profile: WorkerProfile) => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [alias, setAlias] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    const active = i18n.resolvedLanguage || i18n.language;
    return SUPPORTED_LANGUAGE_OPTIONS.some((lang) => lang.code === active)
      ? active
      : "hi-IN";
  });
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLanguageChange = (code: string) => {
    setSelectedLanguage(code);
    void i18n.changeLanguage(code);
  };

  const handlePinSetup = async () => {
    const normalizedAlias = alias.trim();
    if (normalizedAlias.length < 3) {
      setError(t("onboarding:aliasTooShort"));
      setStep(1);
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError(t("onboarding:pinMustBe4Digits"));
      return;
    }
    if (pin !== confirmPin) {
      setError(t("onboarding:pinsDoNotMatch"));
      return;
    }

    setError("");
    setLoading(true);
    try {
      const response = await registerWorker(
        normalizedAlias,
        pin,
        selectedLanguage,
      );
      onLogin(response, { alias: normalizedAlias, language: selectedLanguage });
      navigate("/home", { replace: true });
    } catch (registrationError) {
      setError(
        getApiErrorMessage(registrationError, t("onboarding:authFailed")),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthBackdrop>
      <div className="obsidian-card relative w-full rounded-3xl overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent"
        />
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center gap-1.5 mb-2">
            <span
              className={`h-1.5 w-7 rounded-full transition-colors ${
                step === 1 ? "bg-cyan-400" : "bg-emerald-400"
              }`}
            />
            <span
              className={`h-1.5 w-7 rounded-full transition-colors ${
                step === 2 ? "bg-cyan-400" : "bg-zinc-800"
              }`}
            />
          </div>
          <span className="text-[11px] font-mono font-semibold uppercase tracking-widest text-cyan-300 mb-1">
            {step} / 2
          </span>
          <h1 className="text-2xl font-bold text-white text-center tracking-tight">
            {step === 1 ? t("onboarding:welcome") : t("onboarding:setPin")}
          </h1>
        </div>

        {error && (
          <div
            role="alert"
            className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded-xl mb-4 text-sm"
          >
            {error}
          </div>
        )}

        {step === 1 && (
          <>
            <div className="mb-5">
              <label
                htmlFor="worker-alias"
                className="block text-sm font-medium text-zinc-300 mb-1.5"
              >
                {t("onboarding:alias")}
              </label>
              <input
                id="worker-alias"
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder={t("onboarding:enterAlias")}
                className="w-full px-3.5 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950/90 text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 focus:outline-none transition"
                maxLength={50}
                autoComplete="username"
              />
            </div>
            <p className="text-sm font-medium text-zinc-300 mb-2.5">
              {t("onboarding:chooseLanguage")}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {SUPPORTED_LANGUAGE_OPTIONS.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`p-3 rounded-xl border text-sm font-semibold transition-all ${
                    selectedLanguage === lang.code
                      ? "bg-cyan-400/15 text-cyan-200 border-cyan-400/60 shadow-[0_0_20px_-6px_rgba(34,211,238,0.45)]"
                      : "bg-zinc-950/80 text-zinc-300 border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700 hover:text-white"
                  }`}
                >
                  {lang.name}
                </button>
              ))}
            </div>
            <Button
              onClick={() => {
                if (alias.trim().length < 3) {
                  setError(t("onboarding:aliasTooShort"));
                  return;
                }
                setError("");
                setStep(2);
              }}
              className="mt-6 w-full"
            >
              {t("common:next")}
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  {t("onboarding:createPin")}
                </label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="w-full px-3.5 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950/90 text-zinc-100 placeholder:text-zinc-600 text-center font-mono tracking-[0.45em] focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 focus:outline-none transition"
                  inputMode="numeric"
                  maxLength={4}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  {t("onboarding:confirmPin")}
                </label>
                <input
                  type="password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="••••"
                  className="w-full px-3.5 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950/90 text-zinc-100 placeholder:text-zinc-600 text-center font-mono tracking-[0.45em] focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 focus:outline-none transition"
                  inputMode="numeric"
                  maxLength={4}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => setStep(1)}
                variant="secondary"
                className="flex-1"
              >
                {t("common:back")}
              </Button>
              <Button
                onClick={handlePinSetup}
                disabled={loading}
                className="flex-1"
              >
                {loading ? t("common:loading") : t("common:save")}
              </Button>
            </div>
          </>
        )}

        {step === 1 && (
          <p className="mt-5 pt-4 border-t border-white/[0.08] text-center text-sm text-zinc-400">
            {t("onboarding:haveAccount")}{" "}
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              {t("onboarding:login")}
            </button>
          </p>
        )}
      </div>
    </AuthBackdrop>
  );
}
