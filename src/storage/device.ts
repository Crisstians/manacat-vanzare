import * as SecureStore from "expo-secure-store";
import type { AuthSession, DeviceConfig } from "../api/types";

const DEVICE_KEY = "manacat.device";
const SESSION_KEY = "manacat.session";

export async function loadDeviceConfig(): Promise<DeviceConfig | null> {
  const raw = await SecureStore.getItemAsync(DEVICE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DeviceConfig;
  } catch {
    return null;
  }
}

export async function saveDeviceConfig(config: DeviceConfig): Promise<void> {
  await SecureStore.setItemAsync(DEVICE_KEY, JSON.stringify(config));
}

export async function clearDeviceConfig(): Promise<void> {
  await SecureStore.deleteItemAsync(DEVICE_KEY);
}

export async function loadSession(): Promise<AuthSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export async function saveSession(session: AuthSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
