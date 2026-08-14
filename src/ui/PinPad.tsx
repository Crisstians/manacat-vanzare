import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, touchMin } from "../theme";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

type PinPadProps = {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  disabled?: boolean;
};

export function PinPad({ value, onChange, maxLength = 6, disabled }: PinPadProps) {
  const press = (key: (typeof KEYS)[number]) => {
    if (disabled || key === "") return;
    if (key === "back") {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= maxLength) return;
    onChange(value + key);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.dots} accessibilityLabel={`PIN, ${value.length} cifre`}>
        {Array.from({ length: maxLength }, (_, index) => (
          <View
            key={index}
            style={[styles.dot, index < value.length ? styles.dotFilled : styles.dotEmpty]}
          />
        ))}
      </View>
      <View style={styles.grid}>
        {[0, 1, 2, 3].map((row) => (
          <View key={row} style={styles.gridRow}>
            {KEYS.slice(row * 3, row * 3 + 3).map((key, index) => {
              if (key === "") {
                return <View key={`empty-${row}-${index}`} style={styles.key} />;
              }
              const label = key === "back" ? "Șterge" : key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={key === "back" ? "Șterge ultima cifră" : `Cifra ${key}`}
                  style={[styles.key, styles.keyBtn, disabled && styles.disabled]}
                  disabled={disabled}
                  onPress={() => press(key)}
                >
                  <Text style={[styles.keyText, key === "back" && styles.keyBack]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  dotEmpty: {
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  dotFilled: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  grid: { gap: 10 },
  gridRow: { flexDirection: "row", gap: 10 },
  key: {
    flex: 1,
    minHeight: touchMin + 8,
  },
  keyBtn: {
    backgroundColor: colors.panel,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius,
    alignItems: "center",
    justifyContent: "center",
  },
  keyText: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  keyBack: {
    fontSize: 18,
  },
  disabled: { opacity: 0.4 },
});
