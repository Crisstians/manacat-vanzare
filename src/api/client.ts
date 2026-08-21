import { apiUrl } from "../config";
import type { AuthSession } from "./types";

type ApiErrorBody = { error?: string; code?: string };
type ApiResponse<T> = { data: T };

const REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class TimeoutError extends Error {
  constructor(message = "Nu s-a primit răspuns de la server. Încearcă din nou.") {
    super(message);
    this.name = "TimeoutError";
  }
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "NOT_FOUND";
}

export function isTimeoutError(error: unknown): boolean {
  return error instanceof TimeoutError;
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshHandler: ((session: AuthSession) => Promise<AuthSession>) | null = null;
let onAuthLost: (() => void) | null = null;
let refreshInFlight: Promise<AuthSession> | null = null;

export function setAuthTokens(session: { accessToken: string; refreshToken: string } | null) {
  accessToken = session?.accessToken ?? null;
  refreshToken = session?.refreshToken ?? null;
}

export function configureAuth(handlers: {
  refresh: (session: AuthSession) => Promise<AuthSession>;
  onAuthLost: () => void;
}) {
  refreshHandler = handlers.refresh;
  onAuthLost = handlers.onAuthLost;
}

async function parseError(response: Response): Promise<{ error: string; code?: string }> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return { error: body.error ?? "Cererea a eșuat.", code: body.code };
  } catch {
    return { error: "Cererea a eșuat." };
  }
}

function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const caller = init.signal;
  if (caller?.aborted) {
    controller.abort();
  } else {
    caller?.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  return fetch(url, { ...init, signal: controller.signal })
    .catch((error: unknown) => {
      if (timedOut) throw new TimeoutError();
      throw error;
    })
    .finally(() => {
      clearTimeout(timer);
    });
}

async function refreshSessionTokens(): Promise<AuthSession> {
  if (refreshInFlight) return refreshInFlight;
  if (!refreshToken || !refreshHandler) {
    throw new Error("no refresh");
  }

  const currentRefreshToken = refreshToken;
  refreshInFlight = refreshHandler({
    accessToken: accessToken ?? "",
    refreshToken: currentRefreshToken,
    staff: {
      id: "",
      name: "",
      storeId: "",
      departmentId: "",
      departmentName: "",
    },
  }).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export function refreshAuth(): Promise<AuthSession> {
  return refreshSessionTokens();
}

function shouldLogoutOnRefreshFailure(error: unknown): boolean {
  if (isTimeoutError(error)) return false;
  if (!(error instanceof ApiError) || error.status == null) return false;
  if (error.status === 408 || error.status === 429) return false;
  return error.status >= 400 && error.status < 500;
}

async function request<T>(path: string, init: RequestInit, retry = true): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetchWithTimeout(apiUrl(path), { ...init, headers });

  if (response.status === 401 && retry && refreshToken && refreshHandler) {
    try {
      const session = await refreshSessionTokens();
      setAuthTokens(session);
      return request<T>(path, init, false);
    } catch (error) {
      if (shouldLogoutOnRefreshFailure(error)) {
        onAuthLost?.();
        throw new Error("Sesiunea a expirat. Autentifică-te din nou.");
      }
      throw error instanceof Error ? error : new TimeoutError();
    }
  }

  if (!response.ok) {
    const parsed = await parseError(response);
    throw new ApiError(parsed.error, parsed.code, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const json = (await response.json()) as ApiResponse<T>;
  return json.data;
}

export const getJson = <T>(path: string, init?: Omit<RequestInit, "method">) =>
  request<T>(path, { ...init, method: "GET" });

export const postJson = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });

export const patchJson = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(body) });

export const deleteJson = <T>(path: string) => request<T>(path, { method: "DELETE" });

async function readJsonBody<T>(response: Response): Promise<{ data?: T; error?: string; code?: string }> {
  try {
    return (await response.json()) as { data?: T; error?: string; code?: string };
  } catch {
    return {};
  }
}

export const getPublicJson = async <T>(path: string): Promise<T> => {
  const response = await fetchWithTimeout(apiUrl(path));
  const json = await readJsonBody<T>(response);
  if (!response.ok) {
    throw new ApiError(json.error ?? "Cererea a eșuat.", json.code, response.status);
  }
  return json.data as T;
};

export const postPublicJson = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await fetchWithTimeout(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJsonBody<T>(response);
  if (!response.ok) {
    throw new ApiError(json.error ?? "Cererea a eșuat.", json.code, response.status);
  }
  return json.data as T;
};
