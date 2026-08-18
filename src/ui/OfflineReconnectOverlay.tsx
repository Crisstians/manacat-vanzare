import { StyleSheet, Text, View } from "react-native";
import { useOfflineGuard } from "../network/useOfflineGuard";
import { colors, radius, typeScale } from "../theme";
import { Button } from "./Button";

export function OfflineReconnectOverlay() {
  const { offline, canOpenWifi, openWifi } = useOfflineGuard();
  if (!offline) return null;

  return (
    <View
      accessibilityRole="alert"
      pointerEvents="auto"
      style={styles.overlay}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Fără conexiune la internet</Text>
        <Text style={styles.body}>
          Se încearcă reconectarea automată la Wi-Fi. Dacă rețeaua este oprită, apasă butonul de mai jos.
        </Text>
        {canOpenWifi ? (
          <Button label="Conectare Wi-Fi" onPress={() => void openWifi()} style={styles.button} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    elevation: 100,
    backgroundColor: "rgba(26, 26, 26, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  card: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.danger,
    paddingHorizontal: 28,
    paddingVertical: 28,
    gap: 16,
  },
  title: {
    color: colors.danger,
    fontSize: typeScale.lead,
    fontWeight: "800",
    textAlign: "center",
  },
  body: {
    color: colors.text,
    fontSize: typeScale.body,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 26,
  },
  button: {
    marginTop: 8,
  },
});
