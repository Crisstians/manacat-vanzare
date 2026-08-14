import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../src/auth/AuthContext";
import { useStayInApp } from "../src/kiosk/useStayInApp";
import { colors } from "../src/theme";

export default function RootLayout() {
  useStayInApp();

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.panel },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "700", fontSize: 18, color: colors.text },
          headerShadowVisible: true,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </AuthProvider>
  );
}
