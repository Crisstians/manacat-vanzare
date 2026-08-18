import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

type ApkInstallerNative = {
  canRequestPackageInstalls: () => boolean;
  prepareForExternalUi: () => Promise<void>;
  requestWifiReconnect: () => Promise<boolean>;
  openWifiSettings: () => Promise<void>;
  openUnknownSourcesSettings: () => Promise<void>;
  installApk: (fileUri: string) => Promise<void>;
};

const native =
  Platform.OS === "android" ? requireOptionalNativeModule<ApkInstallerNative>("ApkInstaller") : null;

export function isApkInstallAvailable(): boolean {
  return native != null;
}

export function canRequestPackageInstalls(): boolean {
  return native?.canRequestPackageInstalls() ?? false;
}

export async function prepareForExternalUi(): Promise<void> {
  await native?.prepareForExternalUi();
}

export function isWifiAssistAvailable(): boolean {
  return native != null;
}

export async function requestWifiReconnect(): Promise<boolean> {
  return (await native?.requestWifiReconnect()) ?? false;
}

export async function openWifiSettings(): Promise<void> {
  if (!native) return;
  await native.openWifiSettings();
}

export async function openUnknownSourcesSettings(): Promise<void> {
  if (!native) {
    throw new Error("Instalarea APK nu este disponibilă în această versiune.");
  }
  await native.openUnknownSourcesSettings();
}

export async function installApk(fileUri: string): Promise<void> {
  if (!native) {
    throw new Error("Instalarea APK nu este disponibilă în această versiune.");
  }
  await native.installApk(fileUri);
}
