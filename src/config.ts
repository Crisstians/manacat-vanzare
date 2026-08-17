export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  "https://server-manacat-production.up.railway.app/api/v1";

export const APK_MANIFEST_URL =
  process.env.EXPO_PUBLIC_APK_MANIFEST_URL ??
  "https://github.com/Crisstians/manacat-vanzare/releases/latest/download/version.json";

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

export function apiOrigin(): string {
  return API_BASE_URL.replace(/\/api\/v1\/?$/, "");
}
