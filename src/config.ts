export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  "https://server-manacat-production.up.railway.app/api/v1";

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

export function apiOrigin(): string {
  return API_BASE_URL.replace(/\/api\/v1\/?$/, "");
}
