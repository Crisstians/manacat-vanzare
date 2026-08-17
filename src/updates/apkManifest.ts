import { APK_MANIFEST_URL } from "../config";

export type ApkManifest = {
  versionCode: number;
  versionName: string;
  url: string;
};

function isManifest(value: unknown): value is ApkManifest {
  if (value == null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.versionCode === "number" &&
    Number.isFinite(record.versionCode) &&
    typeof record.versionName === "string" &&
    typeof record.url === "string" &&
    record.url.startsWith("https://")
  );
}

export async function fetchApkManifest(): Promise<ApkManifest | null> {
  const response = await fetch(APK_MANIFEST_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const body: unknown = await response.json();
  return isManifest(body) ? body : null;
}
