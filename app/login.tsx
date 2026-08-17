import { useEffect, useState } from "react";
import { router, Stack } from "expo-router";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as floorApi from "../src/api/floorApi";
import type { PublicStaff } from "../src/api/types";
import { useAuth } from "../src/auth/AuthContext";
import { colors, pressedOpacity, radius, touchMin, typeScale } from "../src/theme";
import { Button } from "../src/ui/Button";
import { PinPad } from "../src/ui/PinPad";
import { StatusBanner } from "../src/ui/StatusBanner";

export default function LoginScreen() {
  const { device, login, status } = useAuth();
  const [staff, setStaff] = useState<PublicStaff[]>([]);
  const [selected, setSelected] = useState<PublicStaff | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "ready") {
      router.replace("/tickets");
    }
  }, [status]);

  useEffect(() => {
    if (!device) return;
    void floorApi
      .bootstrap(device.storeId, device.departmentId)
      .then((data) => setStaff(data.staff))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Eroare"));
  }, [device]);

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await login(selected.id, pin);
      router.replace("/tickets");
    } catch (err) {
      setError(err instanceof Error ? err.message : "PIN invalid");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const pickStaff = (person: PublicStaff) => {
    setSelected(person);
    setPin("");
    setError(null);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: device ? `${device.storeName} · ${device.departmentName}` : "Login" }} />
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.step}>Pasul 1</Text>
          <Text style={styles.lead}>Cine ești?</Text>
          <FlatList
            data={staff}
            keyExtractor={(item) => item.id}
            style={styles.flex}
            contentContainerStyle={styles.staffList}
            renderItem={({ item }) => (
              <Pressable
                android_ripple={{ color: "rgba(0,0,0,0.08)" }}
                style={({ pressed }) => [
                  styles.person,
                  selected?.id === item.id && styles.personActive,
                  pressed && { opacity: pressedOpacity },
                ]}
                onPress={() => pickStaff(item)}
              >
                <Text style={styles.personName}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
        <ScrollView style={styles.col} contentContainerStyle={styles.pinCol} keyboardShouldPersistTaps="handled">
          <Text style={styles.step}>Pasul 2</Text>
          <Text style={styles.lead}>{selected ? `PIN pentru ${selected.name}` : "Introdu PIN-ul"}</Text>
          {!selected ? (
            <Text style={styles.hint}>Alege-ți numele din stânga, apoi tastează PIN-ul.</Text>
          ) : null}
          <PinPad value={pin} onChange={setPin} disabled={!selected || busy} />
          {error ? <StatusBanner message={error} onDismiss={() => setError(null)} /> : null}
          <Button
            label="Intră"
            onPress={() => void submit()}
            disabled={!selected || pin.length < 4 || busy}
            loading={busy}
          />
          <Button
            variant="ghost"
            label="Schimbă raionul tabletei"
            onPress={() => router.replace("/setup")}
          />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 24 },
  row: { flex: 1, flexDirection: "row", gap: 28 },
  col: { flex: 1, gap: 12 },
  pinCol: { gap: 12, paddingBottom: 16 },
  step: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  lead: { color: colors.text, fontSize: typeScale.lead, fontWeight: "800" },
  hint: { color: colors.muted, fontSize: typeScale.body, lineHeight: 26 },
  staffList: { gap: 10, paddingBottom: 16 },
  person: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 16,
    justifyContent: "center",
    minHeight: touchMin + 8,
    overflow: "hidden",
  },
  personActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  personName: { color: colors.text, fontSize: 20, fontWeight: "700" },
  flex: { flex: 1 },
});
