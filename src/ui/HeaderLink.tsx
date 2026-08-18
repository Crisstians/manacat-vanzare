import { Pressable, StyleSheet, Text } from "react-native";
import { colors, pressedOpacity, radius, touchMin } from "../theme";

type HeaderLinkProps = {
  label: string;
  onPress: () => void;
};

export function HeaderLink({ label, onPress }: HeaderLinkProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && { opacity: pressedOpacity }]}
      hitSlop={8}
      android_ripple={{ color: "rgba(0,0,0,0.08)" }}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    minHeight: touchMin,
    justifyContent: "center",
    paddingHorizontal: 8,
    overflow: "hidden",
    borderRadius: radius,
  },
  text: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 18,
  },
});
