import { useEffect } from "react";
import { router, Stack } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth/AuthContext";
import { colors, pressedOpacity, radius, touchMin, typeScale } from "../src/theme";
import { HeaderLink } from "../src/ui/HeaderLink";

const actions = [
  {
    href: "/tickets" as const,
    label: "Bilete",
    detail: "Deschide, scanează și adaugă produse pe bilete.",
  },
  {
    href: "/scan-links" as const,
    label: "Asociază coduri",
    detail: "Leagă un cod de pe ambalaj de un produs existent.",
  },
  {
    href: "/stock" as const,
    label: "Stocuri (24h)",
    detail: "Ce a intrat pe stoc din ultimul raport Excel.",
  },
];

export default function HomeScreen() {
  const { device, session, status, logout } = useAuth();
  const subtitle = `${device?.storeName ?? ""} · ${device?.departmentName ?? ""}`;
  const staffName = session?.staff.name ?? "";

  useEffect(() => {
    if (status === "needs-login") router.replace("/login");
    if (status === "needs-setup") router.replace("/setup");
  }, [status]);

  const confirmLogout = () => {
    Alert.alert("Ieșire?", "Te deconectezi de pe această tabletă.", [
      { text: "Anulează", style: "cancel" },
      {
        text: "Ieșire",
        style: "destructive",
        onPress: () => void logout().then(() => router.replace("/login")),
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: subtitle,
          headerBackVisible: false,
          headerRight: () => <HeaderLink label="Ieșire" onPress={confirmLogout} />,
        }}
      />
      <Text style={styles.lead}>Ce vrei să faci, {staffName}?</Text>
      <View style={styles.grid}>
        {actions.map((action) => (
          <Pressable
            key={action.href}
            android_ripple={{ color: "rgba(0,0,0,0.08)" }}
            style={({ pressed }) => [styles.card, pressed && { opacity: pressedOpacity }]}
            onPress={() => router.push(action.href)}
          >
            <Text style={styles.cardLabel}>{action.label}</Text>
            <Text style={styles.cardDetail}>{action.detail}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 28,
    gap: 24,
  },
  lead: {
    color: colors.text,
    fontSize: typeScale.lead,
    fontWeight: "800",
  },
  grid: {
    flex: 1,
    flexDirection: "row",
    gap: 20,
  },
  card: {
    flex: 1,
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 24,
    minHeight: touchMin * 3,
    justifyContent: "center",
    gap: 12,
    overflow: "hidden",
  },
  cardLabel: {
    color: colors.text,
    fontSize: typeScale.lead,
    fontWeight: "800",
  },
  cardDetail: {
    color: colors.muted,
    fontSize: typeScale.body,
    lineHeight: 26,
  },
});
