import { useNetworkState, type NetworkState } from "expo-network";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  isWifiAssistAvailable,
  openWifiSettings,
  requestWifiReconnect,
} from "../../modules/apk-installer";

const OFFLINE_DEBOUNCE_MS = 4000;
const RETRY_EVERY_MS = 20000;

function isOffline(state: NetworkState): boolean {
  return state.isConnected === false;
}

export function useOfflineGuard() {
  const networkState = useNetworkState();
  const [offline, setOffline] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const networkStateRef = useRef(networkState);
  networkStateRef.current = networkState;
  const disconnected = isOffline(networkState);

  useEffect(() => {
    if (!disconnected) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setOffline(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      setOffline(true);
      void requestWifiReconnect();
    }, OFFLINE_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [disconnected]);

  useEffect(() => {
    if (!offline) return;
    const id = setInterval(() => {
      void requestWifiReconnect();
    }, RETRY_EVERY_MS);
    return () => clearInterval(id);
  }, [offline]);

  useEffect(() => {
    const appState = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      if (isOffline(networkStateRef.current)) {
        void requestWifiReconnect();
      }
    });
    return () => appState.remove();
  }, []);

  return {
    offline,
    canOpenWifi: isWifiAssistAvailable(),
    openWifi: () => openWifiSettings(),
  };
}
