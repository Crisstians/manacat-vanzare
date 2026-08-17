import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, pressedOpacity, radius, touchMin, typeScale } from "../theme";

type BannerTone = "error" | "offline" | "info";

type StatusBannerProps = {
  message: string;
  tone?: BannerTone;
  onDismiss?: () => void;
};

export function StatusBanner({ message, tone = "error", onDismiss }: StatusBannerProps) {
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, toneStyles[tone]]}
    >
      <Text style={[styles.text, textStyles[tone]]}>{message}</Text>
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Închide"
          onPress={onDismiss}
          hitSlop={8}
          style={({ pressed }) => [styles.dismiss, pressed && { opacity: pressedOpacity }]}
        >
          <Text style={[styles.dismissText, textStyles[tone]]}>Închide</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type PillProps = {
  connected: boolean;
};

export function ConnectionPill({ connected }: PillProps) {
  return (
    <View
      accessibilityRole="text"
      style={[styles.pill, connected ? styles.pillOn : styles.pillOff]}
    >
      <View style={[styles.dot, connected ? styles.dotOn : styles.dotOff]} />
      <Text style={[styles.pillText, connected ? styles.pillTextOn : styles.pillTextOff]}>
        {connected ? "Conectat" : "Offline"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1.5,
  },
  text: {
    flex: 1,
    fontSize: typeScale.body,
    fontWeight: "700",
  },
  dismiss: {
    minHeight: touchMin - 12,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  dismissText: {
    fontSize: 16,
    fontWeight: "800",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1.5,
  },
  pillOn: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  },
  pillOff: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
  },
  pillText: {
    fontSize: 16,
    fontWeight: "800",
  },
  pillTextOn: { color: colors.successText },
  pillTextOff: { color: colors.danger },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotOn: { backgroundColor: colors.success },
  dotOff: { backgroundColor: colors.danger },
});

const toneStyles = StyleSheet.create({
  error: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
  },
  offline: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
  },
  info: {
    backgroundColor: colors.panelAlt,
    borderColor: colors.border,
  },
});

const textStyles = StyleSheet.create({
  error: { color: colors.danger },
  offline: { color: colors.danger },
  info: { color: colors.text },
});
