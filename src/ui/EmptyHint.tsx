import { StyleSheet, Text, View } from "react-native";
import { colors, typeScale } from "../theme";

type EmptyHintProps = {
  title: string;
  detail?: string;
};

export function EmptyHint({ title, detail }: EmptyHintProps) {
  return (
    <View style={styles.box} accessibilityRole="text">
      <Text style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: typeScale.lead,
    fontWeight: "800",
    textAlign: "center",
  },
  detail: {
    color: colors.muted,
    fontSize: typeScale.body,
    textAlign: "center",
    lineHeight: 26,
  },
});
