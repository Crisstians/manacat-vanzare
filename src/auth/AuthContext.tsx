import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { configureAuth, setAuthTokens } from "../api/client";
import * as floorApi from "../api/floorApi";
import type { AuthSession, DeviceConfig } from "../api/types";
import {
  clearSession,
  loadDeviceConfig,
  loadSession,
  saveDeviceConfig,
  saveSession,
} from "../storage/device";

type Status = "loading" | "needs-setup" | "needs-login" | "ready";

type AuthContextValue = {
  status: Status;
  device: DeviceConfig | null;
  session: AuthSession | null;
  saveSetup: (device: DeviceConfig) => Promise<void>;
  login: (staffId: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [device, setDevice] = useState<DeviceConfig | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);

  const applySession = useCallback(async (next: AuthSession | null) => {
    if (next) {
      setAuthTokens(next);
      await saveSession(next);
      setSession(next);
      setStatus("ready");
    } else {
      setAuthTokens(null);
      await clearSession();
      setSession(null);
      setStatus("needs-login");
    }
  }, []);

  useEffect(() => {
    configureAuth({
      refresh: async (current) => {
        const token = current.refreshToken || session?.refreshToken;
        if (!token) throw new Error("no refresh");
        const refreshed = await floorApi.refreshSession(token);
        await applySession(refreshed);
        return refreshed;
      },
      onAuthLost: () => {
        void applySession(null);
      },
    });
  }, [applySession, session?.refreshToken]);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      const storedDevice = await loadDeviceConfig();
      if (cancelled) return;
      if (!storedDevice) {
        setStatus("needs-setup");
        return;
      }
      setDevice(storedDevice);
      const storedSession = await loadSession();
      if (cancelled) return;
      if (!storedSession?.refreshToken) {
        setStatus("needs-login");
        return;
      }
      try {
        const refreshed = await floorApi.refreshSession(storedSession.refreshToken);
        if (cancelled) return;
        await applySession(refreshed);
      } catch {
        if (cancelled) return;
        await applySession(null);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const saveSetup = useCallback(async (next: DeviceConfig) => {
    await saveDeviceConfig(next);
    setDevice(next);
    setStatus("needs-login");
  }, []);

  const login = useCallback(
    async (staffId: string, pin: string) => {
      if (!device) throw new Error("Tableta nu este configurată.");
      const next = await floorApi.login({
        storeId: device.storeId,
        departmentId: device.departmentId,
        staffId,
        pin,
      });
      await applySession(next);
    },
    [applySession, device],
  );

  const logout = useCallback(async () => {
    if (session?.refreshToken) {
      try {
        await floorApi.logout(session.refreshToken);
      } catch {
        // ignore
      }
    }
    await applySession(null);
  }, [applySession, session?.refreshToken]);

  const value = useMemo(
    () => ({ status, device, session, saveSetup, login, logout }),
    [device, login, logout, saveSetup, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
