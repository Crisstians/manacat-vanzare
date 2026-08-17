import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, radius, typeScale } from "../theme";
import { Button } from "./Button";
import { useAppUpdates } from "../updates/useAppUpdates";

export function UpdateBanner() {
  const update = useAppUpdates();
  if (!update.kind && !update.error) return null;

  const percent =
    update.progress != null ? Math.round(update.progress * 100) : null;

  let message = "Este disponibilă o actualizare.";
  let action = "Actualizează";
  if (update.kind === "apk") {
    message = update.versionLabel
      ? `Versiune nouă ${update.versionLabel}: trebuie instalat un APK.`
      : "Este disponibil un APK nou.";
    action = "Descarcă și instalează";
    if (update.waitingForInstallPermission) {
      message =
        "Permite instalarea din surse necunoscute pentru Manacat Magazin, apoi revino în aplicație.";
      action = "Deschide din nou instalatorul";
    } else if (percent != null && update.busy) {
      message = `Se descarcă actualizarea… ${percent}%`;
    }
  } else if (update.kind === "js") {
    message = "Actualizare pregătită. Se aplică imediat, fără APK nou.";
    action = "Aplică acum";
  }

  return (
    <View accessibilityRole="alert" style={styles.banner}>
      <View style={styles.copy}>
        <Text style={styles.title}>Actualizare</Text>
        <Text style={styles.message}>{update.error ?? message}</Text>
      </View>
      {update.kind ? (
        <Button
          label={action}
          onPress={() => void update.apply()}
          disabled={update.busy && !update.waitingForInstallPermission}
          loading={update.busy && !update.waitingForInstallPermission}
          style={styles.button}
        />
      ) : null}
      {update.busy && update.kind === "apk" && percent == null ? (
        <ActivityIndicator color={colors.accent} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: colors.accentSoft,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  copy: { flex: 1, gap: 4 },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  message: {
    color: colors.text,
    fontSize: typeScale.body,
    fontWeight: "600",
  },
  button: {
    minWidth: 220,
    borderRadius: radius,
  },
});
