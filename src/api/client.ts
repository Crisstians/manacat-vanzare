import { apiUrl } from "../config";
import type { AuthSession } from "./types";

type ApiErrorBody = { error?: string; code?: string };
type ApiResponse<T> = { data: T };

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

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "NOT_FOUND";
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshHandler: ((session: AuthSession) => Promise<AuthSession>) | null = null;
let onAuthLost: (() => void) | null = null;

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

  const response = await fetch(apiUrl(path), { ...init, headers });

  if (response.status === 401 && retry && refreshToken && refreshHandler) {
    try {
      const session = await refreshHandler({
        accessToken: accessToken ?? "",
        refreshToken,
        staff: {
          id: "",
          name: "",
          storeId: "",
          departmentId: "",
          departmentName: "",
        },
      });
      setAuthTokens(session);
      return request<T>(path, init, false);
    } catch {
      onAuthLost?.();
      throw new Error("Sesiunea a expirat. Autentifică-te din nou.");
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

export const getJson = <T>(path: string) => request<T>(path, { method: "GET" });

export const postJson = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });

export const patchJson = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(body) });

export const deleteJson = <T>(path: string) => request<T>(path, { method: "DELETE" });

export const getPublicJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(apiUrl(path));
  if (!response.ok) {
    const parsed = await parseError(response);
    throw new ApiError(parsed.error, parsed.code, response.status);
  }
  const json = (await response.json()) as ApiResponse<T>;
  return json.data;
};
