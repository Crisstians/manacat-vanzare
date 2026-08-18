import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { AuthProvider } from "../src/auth/AuthContext";
import { useStayInApp } from "../src/kiosk/useStayInApp";
import { colors } from "../src/theme";
import { OfflineReconnectOverlay } from "../src/ui/OfflineReconnectOverlay";
import { UpdateBanner } from "../src/ui/UpdateBanner";

export default function RootLayout() {
  useStayInApp();

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <UpdateBanner />
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.panel },
              headerTintColor: colors.text,
              headerTitleStyle: { fontWeight: "700", fontSize: 18, color: colors.text },
              headerShadowVisible: true,
              contentStyle: { backgroundColor: colors.bg },
            }}
          />
        </View>
        <OfflineReconnectOverlay />
      </View>
    </AuthProvider>
  );
}
