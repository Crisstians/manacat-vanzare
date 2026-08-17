import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system/legacy";
import * as Updates from "expo-updates";
import {
  canRequestPackageInstalls,
  installApk,
  isApkInstallAvailable,
  openUnknownSourcesSettings,
} from "../../modules/apk-installer";
import { fetchApkManifest, type ApkManifest } from "./apkManifest";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const APK_FILE_NAME = "manacat-update.apk";

export type AppUpdateKind = "js" | "apk";

type AppUpdateState = {
  kind: AppUpdateKind | null;
  versionLabel: string | null;
  progress: number | null;
  busy: boolean;
  waitingForInstallPermission: boolean;
  error: string | null;
  apply: () => Promise<void>;
};

function currentVersionCode(): number | null {
  const raw = Application.nativeBuildVersion;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function apkPath(): string {
  const directory = FileSystem.cacheDirectory;
  if (!directory) {
    throw new Error("Spațiul de cache nu este disponibil.");
  }
  return `${directory}${APK_FILE_NAME}`;
}

export function useAppUpdates(): AppUpdateState {
  const [apk, setApk] = useState<ApkManifest | null>(null);
  const [jsReady, setJsReady] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitingForInstallPermission, setWaitingForInstallPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const downloadedUri = useRef<string | null>(null);

  const checkJs = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled) return;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) return;
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew || fetched.isRollBackToEmbedded) {
        setJsReady(true);
      }
    } catch {
      // Keep the current bundle if the update server is unreachable.
    }
  }, []);

  const checkApk = useCallback(async () => {
    if (__DEV__ || Platform.OS !== "android" || !isApkInstallAvailable()) return;
    const installed = currentVersionCode();
    if (installed == null) return;
    try {
      const manifest = await fetchApkManifest();
      if (!manifest || manifest.versionCode <= installed) {
        setApk(null);
        return;
      }
      setApk(manifest);
    } catch {
      // No public APK manifest yet, or GitHub is unreachable.
    }
  }, []);

  const checkAll = useCallback(async () => {
    await Promise.all([checkJs(), checkApk()]);
  }, [checkApk, checkJs]);

  useEffect(() => {
    void checkAll();
    const interval = setInterval(() => void checkAll(), CHECK_EVERY_MS);
    const appState = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      void checkAll();
      if (waitingForInstallPermission && canRequestPackageInstalls() && downloadedUri.current) {
        setWaitingForInstallPermission(false);
        void installApk(downloadedUri.current).catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Nu s-a putut deschide instalatorul.");
        });
      }
    });
    return () => {
      clearInterval(interval);
      appState.remove();
    };
  }, [checkAll, waitingForInstallPermission]);

  const applyJs = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await Updates.reloadAsync();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Nu s-a putut aplica actualizarea.");
    }
  }, []);

  const applyApk = useCallback(async () => {
    if (!apk) return;
    setBusy(true);
    setError(null);
    try {
      let fileUri = downloadedUri.current;
      if (!fileUri) {
        const destination = apkPath();
        const existing = await FileSystem.getInfoAsync(destination);
        if (existing.exists) {
          await FileSystem.deleteAsync(destination, { idempotent: true });
        }
        setProgress(0);
        const download = FileSystem.createDownloadResumable(
          apk.url,
          destination,
          {},
          ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
            if (totalBytesExpectedToWrite > 0) {
              setProgress(totalBytesWritten / totalBytesExpectedToWrite);
            }
          },
        );
        const result = await download.downloadAsync();
        if (!result?.uri) {
          throw new Error("Descărcarea APK-ului a eșuat.");
        }
        fileUri = result.uri;
        downloadedUri.current = fileUri;
        setProgress(1);
      }

      if (!canRequestPackageInstalls()) {
        setWaitingForInstallPermission(true);
        await openUnknownSourcesSettings();
        setBusy(false);
        return;
      }

      await installApk(fileUri);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu s-a putut instala actualizarea.");
    } finally {
      setBusy(false);
    }
  }, [apk]);

  const kind: AppUpdateKind | null = apk ? "apk" : jsReady ? "js" : null;

  return {
    kind,
    versionLabel: apk?.versionName ?? null,
    progress: kind === "apk" ? progress : null,
    busy,
    waitingForInstallPermission,
    error,
    apply: kind === "apk" ? applyApk : applyJs,
  };
}
