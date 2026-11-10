import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { AppShell } from "../components/AppShell";
import { Button } from "../components/Button";
import {
  changeWorkerPin,
  getApiErrorMessage,
  SUPPORTED_LANGUAGE_OPTIONS,
  updateWorkerLanguage,
  type WorkerProfile,
} from "../api";

export default function Settings({
  worker,
  onLogout,
  onLanguageChange,
}: {
  worker: WorkerProfile;
  onLogout: () => void;
  onLanguageChange?: (language: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSuccess, setPinSuccess] = useState("");
  const [changingPin, setChangingPin] = useState(false);
  const [changingLanguage, setChangingLanguage] = useState(false);
  const [languageError, setLanguageError] = useState("");

  const handlePinChange = async () => {
    setPinError("");
    setPinSuccess("");
    if (!/^[0-9]{4}$/.test(newPin)) {
      setPinError(t("settings:pinMustBe4Digits"));
      return;
    }
    if (newPin !== confirmPin) {
      setPinError(t("settings:pinsDoNotMatch"));
      return;
    }

    setChangingPin(true);
    try {
      await changeWorkerPin(pin, newPin);
      setPin("");
      setNewPin("");
      setConfirmPin("");
      setPinSuccess(t("settings:pinChanged"));
    } catch (requestError) {
      setPinError(
        getApiErrorMessage(requestError, t("settings:pinChangeFailed")),
      );
    } finally {
      setChangingPin(false);
    }
  };

  const handleDeleteAccount = () => {
    if (confirm(t("settings:deleteAccountConfirm"))) {
      onLogout();
    }
  };

  const handleLanguageSelect = async (code: string) => {
    if (changingLanguage || code === worker.language) return;
    setLanguageError("");
    setChangingLanguage(true);
    try {
      const res = await updateWorkerLanguage(code);
      const nextLanguage = res.language || code;
      await i18n.changeLanguage(nextLanguage);
      onLanguageChange?.(nextLanguage);
    } catch (requestError) {
      setLanguageError(getApiErrorMessage(requestError, t("common:retry")));
    } finally {
      setChangingLanguage(false);
    }
  };

  return (
    <AppShell>
      <AppHeader
        title={t("settings:title")}
        onBack={() => navigate("/home")}
        backLabel={t("common:back")}
        showNav
      />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Worker info */}
        <section className="animate-fade-up obsidian-card rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold text-white">
              {t("settings:workerInfo")}
            </h2>
            <Button onClick={onLogout} variant="secondary" size="sm">
              {t("common:logout")}
            </Button>
          </div>
          <div className="divide-y divide-white/[0.07] text-sm">
            <div className="flex justify-between py-2.5">
              <span className="text-zinc-400">{t("settings:alias")}</span>
              <span className="font-medium text-zinc-100">{worker.alias}</span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-zinc-400">{t("settings:language")}</span>
              <span className="font-mono font-medium text-cyan-300">
                {worker.language}
              </span>
            </div>
          </div>
        </section>

        {/* Language preference */}
        <section className="animate-fade-up obsidian-card rounded-2xl p-5">
          <h2 className="font-semibold text-white mb-1.5">
            {t("settings:language")}
          </h2>
          <p className="text-sm text-zinc-400 mb-2">
            {t("settings:languageDescription")}
          </p>
          <p className="text-xs font-mono font-medium text-cyan-300 mb-3">
            {t("settings:currentLanguage", { lang: worker.language })}
          </p>
          {languageError && (
            <p
              role="alert"
              className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-xl mb-3"
            >
              {languageError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            {SUPPORTED_LANGUAGE_OPTIONS.map((lang) => (
              <button
                key={lang.code}
                type="button"
                disabled={changingLanguage}
                onClick={() => void handleLanguageSelect(lang.code)}
                className={`p-3 rounded-xl border transition-all text-sm font-semibold ${
                  worker.language === lang.code
                    ? "bg-cyan-400/15 text-cyan-200 border-cyan-400/60 shadow-[0_0_20px_-6px_rgba(34,211,238,0.45)]"
                    : "bg-zinc-950/80 text-zinc-300 border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700 hover:text-white"
                }`}
              >
                {lang.name}
              </button>
            ))}
          </div>
        </section>

        {/* Change PIN */}
        <section className="animate-fade-up obsidian-card rounded-2xl p-5">
          <h2 className="font-semibold text-white mb-4">
            {t("settings:changePin")}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                {t("settings:currentPin")}
              </label>
              <input
                id="current-pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={t("settings:enterCurrentPin")}
                className="w-full px-3.5 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950/90 text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 focus:outline-none"
                inputMode="numeric"
                maxLength={72}
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                {t("settings:newPin")}
              </label>
              <input
                id="new-pin"
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder={t("settings:enterNewPin")}
                className="w-full px-3.5 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950/90 text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 focus:outline-none"
                inputMode="numeric"
                maxLength={4}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                {t("settings:confirmNewPin")}
              </label>
              <input
                id="confirm-new-pin"
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder={t("settings:confirmNewPin")}
                className="w-full px-3.5 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950/90 text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 focus:outline-none"
                inputMode="numeric"
                maxLength={4}
                autoComplete="new-password"
              />
            </div>
            {pinError && (
              <p role="alert" className="text-sm text-rose-300">
                {pinError}
              </p>
            )}
            {pinSuccess && (
              <p role="status" className="text-sm text-emerald-300">
                {pinSuccess}
              </p>
            )}
            <Button
              onClick={() => void handlePinChange()}
              disabled={changingPin}
              className="w-full"
            >
              {changingPin ? t("common:loading") : t("settings:savePin")}
            </Button>
          </div>
        </section>

        {/* Data deletion */}
        <section className="animate-fade-up bg-rose-950/25 rounded-2xl border border-rose-500/30 p-5">
          <h2 className="font-semibold text-rose-300 mb-2">
            {t("settings:deleteAccount")}
          </h2>
          <p className="text-sm text-rose-200/80 mb-4">
            {t("settings:deleteAccountWarning")}
          </p>
          <Button
            onClick={handleDeleteAccount}
            variant="danger"
            className="w-full"
          >
            {t("settings:deleteAccount")}
          </Button>
        </section>
      </main>
    </AppShell>
  );
}
