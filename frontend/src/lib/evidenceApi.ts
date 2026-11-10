export interface VerificationResult {
  valid: boolean;
  mismatch_reason: string | null;
  checked_entries?: number;
  chain_head_hash?: string | null;
  message?: string | null;
}

export interface EvidencePackResponse {
  pack_id: number;
  pdf_uri: string;
  zip_uri: string;
  pdf_download_url: string;
  zip_download_url: string;
  chain_head_hash: string;
  entry_count: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly isAuthError: boolean;
  readonly isEmpty: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.isAuthError = status === 401;
    this.isEmpty = status === 404;
  }
}

export function getStoredAuthToken(): string | null {
  try {
    const direct =
      localStorage.getItem("saakshi_token") ||
      localStorage.getItem("access_token");
    if (direct && direct.trim()) {
      return direct.trim();
    }

    const rawWorker = localStorage.getItem("saakshi_worker");
    if (!rawWorker) {
      return null;
    }
    const parsed: unknown = JSON.parse(rawWorker);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const token = record.access_token ?? record.token;
      if (typeof token === "string" && token.trim()) {
        return token.trim();
      }
    }
  } catch {
    return null;
  }
  return null;
}

function buildAuthHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  const token = getStoredAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function parseErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string" && body.detail.trim()) {
        return body.detail;
      }
      if (Array.isArray(body.detail) && body.detail.length > 0) {
        const first = body.detail[0] as { msg?: unknown };
        if (first && typeof first.msg === "string") {
          return first.msg;
        }
      }
    } else {
      const text = (await response.text()).trim();
      if (text) {
        return text;
      }
    }
  } catch {
    // Fall back to HTTP status text when error body cannot be parsed.
  }
  return response.statusText
    ? `${fallback} (${response.status} ${response.statusText})`
    : `${fallback} (${response.status})`;
}

function parseFilename(
  contentDisposition: string | null,
  fallback: string,
): string {
  if (!contentDisposition) {
    return fallback;
  }
  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  const rawName = utfMatch?.[1]
    ? decodeURIComponent(utfMatch[1])
    : contentDisposition.match(/filename="?([^";]+)"?/i)?.[1];

  if (!rawName) {
    return fallback;
  }
  const sanitized = rawName.replace(/[/\\]/g, "_").trim();
  return sanitized || fallback;
}

export async function verifyLedgerChain(): Promise<VerificationResult> {
  let response: Response;
  try {
    response = await fetch("/api/verify", {
      method: "GET",
      headers: buildAuthHeaders(),
    });
  } catch {
    throw new ApiError("Unable to reach verification server.", 0);
  }

  if (!response.ok) {
    const msg = await parseErrorMessage(
      response,
      "Verification request failed",
    );
    throw new ApiError(msg, response.status);
  }

  return (await response.json()) as VerificationResult;
}

export async function generateEvidencePack(
  periodFrom: string,
  periodTo: string,
): Promise<EvidencePackResponse> {
  let response: Response;
  try {
    response = await fetch("/api/evidence", {
      method: "POST",
      headers: buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        period_from: periodFrom,
        period_to: periodTo,
      }),
    });
  } catch {
    throw new ApiError("Unable to reach evidence server.", 0);
  }

  if (!response.ok) {
    const msg = await parseErrorMessage(
      response,
      "Failed to generate evidence pack",
    );
    throw new ApiError(msg, response.status);
  }

  return (await response.json()) as EvidencePackResponse;
}

export async function downloadEvidenceFile(
  downloadUrl: string,
  fallbackFilename: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(downloadUrl, {
      method: "GET",
      headers: buildAuthHeaders(),
    });
  } catch {
    throw new ApiError("Unable to download file from server.", 0);
  }

  if (!response.ok) {
    const msg = await parseErrorMessage(response, "Download failed");
    throw new ApiError(msg, response.status);
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new ApiError("Downloaded file is empty.", 500);
  }

  const filename = parseFilename(
    response.headers.get("content-disposition"),
    fallbackFilename,
  );
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  return filename;
}
