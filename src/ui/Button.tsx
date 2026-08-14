import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radius, touchMin, typeScale } from "../theme";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  disabled,
  loading,
  variant = "primary",
  style,
}: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      style={[styles.base, styles[variant], inactive && styles.disabled, style]}
      disabled={inactive}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? colors.accentText : variant === "danger" ? colors.dangerText : colors.text}
        />
      ) : (
        <Text style={[styles.label, labelStyles[variant]]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchMin,
    borderRadius: radius,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.panel,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: typeScale.button,
    fontWeight: "800",
  },
});

const labelStyles = StyleSheet.create({
  primary: { color: colors.accentText },
  secondary: { color: colors.text },
  danger: { color: colors.dangerText },
  ghost: { color: colors.text },
});
