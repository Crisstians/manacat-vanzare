import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, pressedOpacity, radius, touchMin, typeScale } from "../theme";
import {
  formatQuantityDisplay,
  parseQuantity,
  sanitizeQuantityInput,
  type QuantityKind,
} from "../units";

type QuantityStepperProps = {
  value: string;
  onChange: (next: string) => void;
  kind: QuantityKind;
  unitLabel: string;
  disabled?: boolean;
  max?: number;
};

export function QuantityStepper({
  value,
  onChange,
  kind,
  unitLabel,
  disabled,
  max,
}: QuantityStepperProps) {
  const isPiece = kind === "piece";

  const bump = (delta: number) => {
    const current = Math.floor(Number(value.replace(",", ".")));
    const base = Number.isFinite(current) && current > 0 ? current : 1;
    const next = base + delta;
    const ceiling = max != null && Number.isFinite(max) ? Math.max(1, Math.floor(max)) : Number.POSITIVE_INFINITY;
    onChange(String(Math.min(ceiling, Math.max(1, next))));
  };

  const commitArea = () => {
    const parsed = parseQuantity(value, "area");
    if (!parsed.ok) return;
    onChange(formatQuantityDisplay(parsed.value, "area"));
  };

  if (isPiece) {
    const current = Math.floor(Number(value.replace(",", ".")));
    const plusDisabled =
      disabled || (max != null && Number.isFinite(max) && (Number.isFinite(current) ? current : 1) >= Math.floor(max));
    return (
      <View style={styles.stepper} accessibilityLabel="Cantitate">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scade cantitatea"
          android_ripple={disabled ? undefined : { color: "rgba(0,0,0,0.12)" }}
          style={({ pressed }) => [
            styles.stepBtn,
            pressed && !disabled && { opacity: pressedOpacity },
            disabled && styles.disabled,
          ]}
          disabled={disabled}
          onPress={() => bump(-1)}
        >
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <TextInput
          style={styles.stepInput}
          value={value}
          onChangeText={(next) => onChange(sanitizeQuantityInput(next, "piece"))}
          placeholder="1"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          selectTextOnFocus
          editable={!disabled}
          accessibilityLabel="Cantitate"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Crește cantitatea"
          android_ripple={plusDisabled ? undefined : { color: "rgba(0,0,0,0.12)" }}
          style={({ pressed }) => [
            styles.stepBtn,
            pressed && !plusDisabled && { opacity: pressedOpacity },
            plusDisabled && styles.disabled,
          ]}
          disabled={plusDisabled}
          onPress={() => bump(1)}
        >
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
        {unitLabel ? <Text style={styles.unit}>{unitLabel}</Text> : null}
      </View>
    );
  }

  return (
    <View style={[styles.field, kind === "area" && styles.fieldWide]} accessibilityLabel="Cantitate">
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(next) => onChange(sanitizeQuantityInput(next, kind))}
        onBlur={kind === "area" ? commitArea : undefined}
        placeholder={unitLabel || "Cant"}
        placeholderTextColor={colors.muted}
        keyboardType="decimal-pad"
        editable={!disabled}
      />
      {unitLabel ? <Text style={styles.unit}>{unitLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: touchMin,
  },
  stepBtn: {
    width: touchMin,
    height: touchMin,
    borderRadius: radius,
    backgroundColor: colors.panel,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  stepBtnText: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 32,
  },
  stepInput: {
    minWidth: 72,
    minHeight: touchMin,
    textAlign: "center",
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    padding: 0,
  },
  field: {
    minHeight: touchMin,
    minWidth: 120,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius,
    paddingHorizontal: 14,
  },
  fieldWide: { minWidth: 148 },
  input: {
    flex: 1,
    minWidth: 48,
    color: colors.text,
    fontSize: typeScale.body,
    fontWeight: "700",
    padding: 0,
  },
  unit: {
    color: colors.muted,
    fontSize: typeScale.body,
    fontWeight: "800",
    marginLeft: 6,
  },
  disabled: { opacity: 0.4 },
});
