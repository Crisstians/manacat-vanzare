import { useEffect, useState } from "react";
import { router, Stack } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as floorApi from "../src/api/floorApi";
import type { Department, Store } from "../src/api/types";
import { useAuth } from "../src/auth/AuthContext";
import { colors, radius, touchMin, typeScale } from "../src/theme";
import { Button } from "../src/ui/Button";
import { StatusBanner } from "../src/ui/StatusBanner";

export default function SetupScreen() {
  const { saveSetup } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void floorApi
      .listActiveStores()
      .then(setStores)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Eroare"))
      .finally(() => setLoading(false));
  }, []);

  const pickStore = async (next: Store) => {
    setStore(next);
    setLoading(true);
    setError(null);
    try {
      setDepartments(await floorApi.listDepartments(next.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare");
    } finally {
      setLoading(false);
    }
  };

  const pickDepartment = async (department: Department) => {
    if (!store) return;
    await saveSetup({
      storeId: store.id,
      storeName: store.name,
      departmentId: department.id,
      departmentName: department.name,
    });
    router.replace("/login");
  };

  const goBackToStores = () => {
    setStore(null);
    setDepartments([]);
    setError(null);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "Configurare tabletă" }} />
      <Text style={styles.step}>{store ? "Pasul 2 din 2 — Raion" : "Pasul 1 din 2 — Magazin"}</Text>
      <Text style={styles.lead}>
        {store ? "Alege raionul acestei tablete" : "Alege magazinul"}
      </Text>
      {error ? <StatusBanner message={error} /> : null}
      {loading ? (
        <ActivityIndicator color={colors.accent} size="large" style={styles.spinner} />
      ) : store ? (
        <FlatList
          data={departments}
          keyExtractor={(item) => item.id}
          numColumns={2}
          style={styles.flex}
          columnWrapperStyle={styles.columns}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => void pickDepartment(item)}>
              <Text style={styles.cardTitle}>{item.name}</Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={stores}
          keyExtractor={(item) => item.id}
          numColumns={2}
          style={styles.flex}
          columnWrapperStyle={styles.columns}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => void pickStore(item)}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.muted}>{item.city}</Text>
            </Pressable>
          )}
        />
      )}
      {store ? (
        <Button variant="secondary" label="Înapoi la magazine" onPress={goBackToStores} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 24, gap: 12 },
  step: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  lead: { color: colors.text, fontSize: typeScale.lead, fontWeight: "800" },
  spinner: { marginVertical: 24 },
  grid: { gap: 12, paddingBottom: 16 },
  columns: { gap: 12 },
  card: {
    flex: 1,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius,
    padding: 20,
    minHeight: touchMin + 40,
    justifyContent: "center",
  },
  cardTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  muted: { color: colors.muted, marginTop: 6, fontSize: typeScale.body },
  flex: { flex: 1 },
});
