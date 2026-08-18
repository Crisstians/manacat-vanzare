import { StyleSheet, Text, View } from "react-native";
import { colors, typeScale } from "../theme";
import type { LiveScanCameraProps } from "./liveScanTypes";

export type { LiveScanCameraProps, LiveScanHit } from "./liveScanTypes";

export function LiveScanCamera(_props: LiveScanCameraProps) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.box]}>
      <Text style={styles.message}>Scanarea live nu este disponibilă pe web.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  message: {
    color: colors.text,
    fontSize: typeScale.body,
    textAlign: "center",
    fontWeight: "700",
  },
});
