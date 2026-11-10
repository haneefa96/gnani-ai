// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import Onboarding from "./onboarding/Onboarding";
import Settings from "./Settings";

const HI_LOCALE = {
  common: {
    back: "वापस",
    next: "अगला",
    save: "सेव करें",
    loading: "लोड हो रहा है...",
    logout: "लॉग आउट",
    retry: "फिर से प्रयास करें",
  },
  onboarding: {
    welcome: "साक्षी में आपका स्वागत है",
    setPin: "अपना पिन सेट करें",
    chooseLanguage: "अपनी पसंदीदा भाषा चुनें:",
    alias: "उपनाम",
    enterAlias: "अपना उपनाम दर्ज करें",
    haveAccount: "पहले से खाता है?",
    login: "लॉगिन",
  },
  settings: {
    title: "सेटिंग्स",
    workerInfo: "श्रमिक जानकारी",
    alias: "उपनाम",
    language: "भाषा",
    changePin: "पिन बदलें",
    currentPin: "वर्तमान पिन",
    enterCurrentPin: "वर्तमान पिन दर्ज करें",
    newPin: "नया पिन",
    enterNewPin: "नया पिन दर्ज करें",
    confirmNewPin: "नया पिन पुष्ट करें",
    savePin: "पिन सेव करें",
    deleteAccount: "खाता हटाएं",
    deleteAccountWarning: "चेतावनी",
    languageDescription: "भाषा चुनें",
    currentLanguage: "वर्तमान: {{lang}}",
  },
};

const EN_LOCALE = {
  common: {
    back: "Back",
    next: "Next",
    save: "Save",
    loading: "Loading...",
    logout: "Log out",
    retry: "Retry",
  },
  onboarding: {
    welcome: "Welcome to Saakshi",
    setPin: "Set Your PIN",
    chooseLanguage: "Choose your preferred language:",
    alias: "Alias",
    enterAlias: "Enter your alias",
    haveAccount: "Already have an account?",
    login: "Login",
  },
  settings: {
    title: "Settings",
    workerInfo: "Worker Information",
    alias: "Alias",
    language: "Language",
    changePin: "Change PIN",
    currentPin: "Current PIN",
    enterCurrentPin: "Enter current PIN",
    newPin: "New PIN",
    enterNewPin: "Enter new PIN",
    confirmNewPin: "Confirm New PIN",
    savePin: "Save PIN",
    deleteAccount: "Delete Account",
    deleteAccountWarning: "Warning",
    languageDescription: "Choose your preferred language for the app interface",
    currentLanguage: "Current: {{lang}}",
  },
};

function stubLocaleFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/locales/hi-IN.json") {
        return new Response(JSON.stringify(HI_LOCALE), { status: 200 });
      }
      if (url === "/locales/en-IN.json") {
        return new Response(JSON.stringify(EN_LOCALE), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }),
  );
}

describe("UI language switching", () => {
  const defaultAdapter = api.defaults.adapter;

  afterEach(() => {
    api.defaults.adapter = defaultAdapter;
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    window.localStorage.clear();
  });

  it("switches Onboarding UI immediately when clicking a language button", async () => {
    window.localStorage.setItem("i18nextLng", "hi-IN");
    stubLocaleFetch();

    const { default: i18n, clearLocaleCache } = await import("../i18n");
    await i18n.changeLanguage("hi-IN");
    await i18n.loadNamespaces(["common", "onboarding"]);

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <Onboarding onLogin={vi.fn()} />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByText("साक्षी में आपका स्वागत है")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "English" }));

    await waitFor(() =>
      expect(screen.getByText("Welcome to Saakshi")).toBeTruthy(),
    );
    expect(screen.getByLabelText("Alias")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
    clearLocaleCache();
  });

  it("updates worker language in Settings via API and syncs i18n", async () => {
    window.localStorage.setItem("i18nextLng", "hi-IN");
    stubLocaleFetch();

    const { default: i18n, clearLocaleCache } = await import("../i18n");
    await i18n.changeLanguage("hi-IN");
    await i18n.loadNamespaces(["common", "settings"]);

    let sentPatch: unknown;
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      if (config.url === "/auth/language" && config.method === "patch") {
        sentPatch = JSON.parse(String(config.data));
        return {
          status: 200,
          statusText: "OK",
          headers: new AxiosHeaders(),
          config,
          data: { language: "en-IN" },
        };
      }
      throw new Error(`Unexpected API call: ${config.url}`);
    };

    const onLanguageChange = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <Settings
            worker={{ alias: "shamaz", language: "hi-IN" }}
            onLogout={vi.fn()}
            onLanguageChange={onLanguageChange}
          />
        </MemoryRouter>
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "English" }));

    await waitFor(() => expect(onLanguageChange).toHaveBeenCalledWith("en-IN"));
    expect(sentPatch).toEqual({ language: "en-IN" });
    expect(screen.getByText("Settings")).toBeTruthy();
    clearLocaleCache();
  });
});
