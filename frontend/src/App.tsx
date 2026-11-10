import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import {
  AUTH_EXPIRED_EVENT,
  clearAuthSession,
  getAccessToken,
  restoreAuthSession,
  storeAuthSession,
  type AuthResponse,
  type WorkerProfile,
} from "./api";
import AuthGuard from "./AuthGuard";

// Pages
import Onboarding from "./pages/onboarding/Onboarding";
import Login from "./pages/onboarding/Login";
import Home from "./pages/Home";
import History from "./pages/History";
import Settings from "./pages/Settings";
import ExportScreen from "./pages/ExportScreen";
import ContractorPage from "./pages/contractor/ContractorPage";
import ContractorThanks from "./pages/contractor/ContractorThanks";
import { VoiceTestPage } from "./voice/VoiceTestPage";

function App() {
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoredProfile = restoreAuthSession();
    if (restoredProfile) {
      setWorker(restoredProfile);
      setAuthenticated(true);
    }

    const handleAuthExpired = () => {
      setWorker(null);
      setAuthenticated(false);
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    setLoading(false);
    return () =>
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, []);

  useEffect(() => {
    if (worker?.language && i18n.language !== worker.language) {
      void i18n.changeLanguage(worker.language);
    }
  }, [worker?.language]);

  const handleLogin = (response: AuthResponse, profile: WorkerProfile) => {
    storeAuthSession(response.access_token, profile);
    setWorker(profile);
    setAuthenticated(true);
  };

  const handleLogout = () => {
    clearAuthSession();
    setWorker(null);
    setAuthenticated(false);
  };

  const handleLanguageChange = (language: string) => {
    if (!worker) return;
    const updatedProfile = { ...worker, language };
    const token = getAccessToken();
    if (token) {
      storeAuthSession(token, updatedProfile);
    }
    setWorker(updatedProfile);
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        Loading...
      </div>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              authenticated ? (
                <Navigate to="/home" replace />
              ) : (
                <Onboarding onLogin={handleLogin} />
              )
            }
          />
          <Route
            path="/login"
            element={
              authenticated ? (
                <Navigate to="/home" replace />
              ) : (
                <Login onLogin={handleLogin} />
              )
            }
          />
          <Route element={<AuthGuard authenticated={authenticated} />}>
            <Route path="/home" element={worker && <Home worker={worker} />} />
            <Route path="/history" element={<History />} />
            <Route
              path="/settings"
              element={
                worker && (
                  <Settings
                    worker={worker}
                    onLogout={handleLogout}
                    onLanguageChange={handleLanguageChange}
                  />
                )
              }
            />
            <Route path="/export" element={<ExportScreen />} />
          </Route>
          <Route path="/c/:token" element={<ContractorPage />} />
          <Route path="/contractor/thanks" element={<ContractorThanks />} />
          <Route path="/voice-test" element={<VoiceTestPage />} />
        </Routes>
      </BrowserRouter>
    </I18nextProvider>
  );
}

export default App;
