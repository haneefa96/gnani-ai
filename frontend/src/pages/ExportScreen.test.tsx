// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExportScreen from "./ExportScreen";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockTranslate = (
  key: string,
  opts?: string | { defaultValue?: string; filename?: string },
) => {
  if (typeof opts === "string") {
    return opts;
  }
  if (opts && typeof opts === "object" && opts.defaultValue) {
    return opts.filename
      ? opts.defaultValue.replace("{{filename}}", opts.filename)
      : opts.defaultValue;
  }
  return key;
};

const mockTranslationObj = { t: mockTranslate };

vi.mock("react-i18next", () => ({
  useTranslation: () => mockTranslationObj,
}));

function resolveFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ExportScreen evidence and verification integration", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const createObjectUrlMock = vi.fn(() => "blob:mock-url");
  const revokeObjectUrlMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("saakshi_access_token", "jwt-valid-token");
    localStorage.setItem(
      "saakshi_worker_profile",
      JSON.stringify({ alias: "ramesh", language: "hi-IN" }),
    );
    fetchMock.mockReset();
    mockNavigate.mockReset();
    createObjectUrlMock.mockClear();
    revokeObjectUrlMock.mockClear();

    vi.stubGlobal("fetch", fetchMock);
    URL.createObjectURL = createObjectUrlMock;
    URL.revokeObjectURL = revokeObjectUrlMock;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("verifies chain, generates evidence pack without worker_id, and triggers real PDF/ZIP downloads", async () => {
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    fetchMock.mockImplementation(async (input, init) => {
      const url = resolveFetchUrl(input);
      const auth = (init?.headers as Record<string, string> | undefined)
        ?.Authorization;
      expect(auth).toBe("Bearer jwt-valid-token");

      if (url === "/api/verify") {
        return jsonResponse({
          valid: true,
          mismatch_reason: null,
          checked_entries: 3,
        });
      }
      if (url === "/api/evidence") {
        const parsedBody = JSON.parse(String(init?.body || "{}"));
        expect(parsedBody).toEqual({
          period_from: "2026-11-01",
          period_to: "2026-11-10",
        });
        expect("worker_id" in parsedBody).toBe(false);
        return jsonResponse({
          pack_id: 42,
          pdf_uri: "./data/audio/evidence_99_42.pdf",
          zip_uri: "./data/audio/evidence_99_42.zip",
          pdf_download_url: "/api/evidence/42/pdf",
          zip_download_url: "/api/evidence/42/zip",
          chain_head_hash: "abc123head",
          entry_count: 3,
        });
      }
      if (url === "/api/evidence/42/pdf") {
        return new Response(
          new Blob(["%PDF-1.4 fake pdf"], { type: "application/pdf" }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition":
                'attachment; filename="evidence_pack_42.pdf"',
            },
          },
        );
      }
      if (url === "/api/evidence/42/zip") {
        return new Response(
          new Blob(["PK\x03\x04zip"], { type: "application/zip" }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/zip",
              "Content-Disposition":
                'attachment; filename="evidence_pack_42.zip"',
            },
          },
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    render(
      <MemoryRouter>
        <ExportScreen />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("verify-valid")).toBeTruthy(),
    );
    expect(screen.getByTestId("verify-valid").textContent).toContain(
      "3 entries",
    );

    fireEvent.change(screen.getByLabelText("export:periodFrom"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.change(screen.getByLabelText("export:periodTo"), {
      target: { value: "2026-11-10" },
    });
    fireEvent.click(screen.getByText("export:generate"));

    await waitFor(() =>
      expect(screen.getByTestId("pack-success")).toBeTruthy(),
    );
    expect(screen.getByTestId("pack-success").textContent).toContain(
      "abc123head",
    );

    fireEvent.click(screen.getByText("export:downloadPDF"));
    await waitFor(() =>
      expect(screen.getByTestId("download-notice").textContent).toContain(
        "evidence_pack_42.pdf",
      ),
    );

    fireEvent.click(screen.getByText("export:downloadZIP"));
    await waitFor(() =>
      expect(screen.getByTestId("download-notice").textContent).toContain(
        "evidence_pack_42.zip",
      ),
    );

    expect(createObjectUrlMock).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrlMock).toHaveBeenCalledTimes(2);
    expect(anchorClickSpy).toHaveBeenCalledTimes(2);
    anchorClickSpy.mockRestore();
  });

  it("shows empty state on 404 and mismatch reason when chain fails verification", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = resolveFetchUrl(input);
      if (url === "/api/verify") {
        return jsonResponse({
          valid: false,
          mismatch_reason: "Entry 7 hash mismatch at index 1",
        });
      }
      if (url === "/api/evidence") {
        return jsonResponse(
          { detail: "No entries found for the specified period" },
          404,
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    render(
      <MemoryRouter>
        <ExportScreen />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("verify-invalid")).toBeTruthy(),
    );
    expect(screen.getByTestId("verify-invalid").textContent).toContain(
      "Entry 7 hash mismatch at index 1",
    );

    fireEvent.change(screen.getByLabelText("export:periodFrom"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("export:periodTo"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.click(screen.getByText("export:generate"));

    await waitFor(() =>
      expect(screen.getByTestId("export-empty")).toBeTruthy(),
    );
    expect(screen.queryByTestId("pack-success")).toBeNull();
  });

  it("handles expired/invalid 401 auth and server errors without simulated success", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = resolveFetchUrl(input);
      if (url === "/api/verify") {
        return jsonResponse({ detail: "Token expired" }, 401);
      }
      if (url === "/api/evidence") {
        return jsonResponse({ detail: "Internal error" }, 500);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    render(
      <MemoryRouter>
        <ExportScreen />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId("auth-error")).toBeTruthy());
    expect(screen.getByTestId("auth-error").textContent).toContain(
      "Token expired",
    );

    // Invalid date ordering shows inline error without calling POST /api/evidence
    fireEvent.change(screen.getByLabelText("export:periodFrom"), {
      target: { value: "2026-11-10" },
    });
    fireEvent.change(screen.getByLabelText("export:periodTo"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.click(screen.getByText("export:generate"));
    expect(screen.getByTestId("export-error")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Valid dates hitting 500 error shows export-error and no fake downloads
    fireEvent.change(screen.getByLabelText("export:periodTo"), {
      target: { value: "2026-11-12" },
    });
    fireEvent.click(screen.getByText("export:generate"));
    await waitFor(() =>
      expect(screen.getByTestId("export-error")).toBeTruthy(),
    );
    expect(screen.queryByTestId("pack-success")).toBeNull();
  });
});
