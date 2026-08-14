import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const AVD_NAME = "Manacat_Tablet";

export function resolveSdkRoot() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(homedir(), "AppData", "Local", "Android", "Sdk"),
    path.join(homedir(), "Android", "Sdk"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function sdkBin(sdkRoot, name) {
  const windows = process.platform === "win32";
  const file = windows ? `${name}.exe` : name;
  const locations = [
    path.join(sdkRoot, "emulator", file),
    path.join(sdkRoot, "platform-tools", file),
    path.join(sdkRoot, "cmdline-tools", "latest", "bin", windows ? `${name}.bat` : name),
    path.join(sdkRoot, "cmdline-tools", "latest", "bin", file),
    path.join(sdkRoot, "tools", "bin", windows ? `${name}.bat` : name),
  ];
  return locations.find((candidate) => existsSync(candidate)) ?? null;
}

export function missingSdkMessage() {
  return [
    "Android SDK nu a fost găsit.",
    "Instalează Android SDK Command-line Tools (nu Android Studio ca IDE) și setează ANDROID_HOME.",
    "Apoi rulează: npm run emulator:create",
  ].join("\n");
}
