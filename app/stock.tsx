import { useCallback, useState } from "react";
import { router, Stack, useFocusEffect } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import * as floorApi from "../src/api/floorApi";
import type { StockInboundItem, StockInboundReport } from "../src/api/types";
import { colors, radius, typeScale } from "../src/theme";
import { EmptyHint } from "../src/ui/EmptyHint";
import { HeaderLink } from "../src/ui/HeaderLink";
import { StatusBanner } from "../src/ui/StatusBanner";

function formatQty(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/\.?0+$/, "").replace(".", ",");
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StockScreen() {
  const [report, setReport] = useState<StockInboundReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setReport(await floorApi.listStockInbound());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu s-au putut încărca stocurile");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const lastImport = report?.imports[0];

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: "Stocuri (24h)",
          headerLeft: () => <HeaderLink label="Înapoi" onPress={() => router.replace("/home")} />,
        }}
      />
      {loading && !report ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={report?.items ?? []}
          keyExtractor={(item) => item.id}
          style={styles.flex}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
          }
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              {error ? <StatusBanner message={error} onDismiss={() => setError(null)} /> : null}
              {report ? (
                <View style={styles.summary}>
                  <Text style={styles.summaryTitle}>
                    {report.totals.count === 0
                      ? "Nicio mișcare de stoc"
                      : `${report.totals.count} ${report.totals.count === 1 ? "produs" : "produse"} · +${formatQty(report.totals.sumDelta)}`}
                  </Text>
                  <Text style={styles.summaryMeta}>
                    {lastImport
                      ? `Ultimul import Excel: ${formatWhen(lastImport.importedAt)}${lastImport.importedByName ? ` · ${lastImport.importedByName}` : ""}`
                      : "Niciun import Excel în ultimele 24 de ore"}
                  </Text>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            loading ? null : (
              <EmptyHint
                title="Niciun stoc intrat din Excel în ultimele 24 de ore"
                detail="Când se încarcă un raport Excel pe board, creșterile de stoc ale acestui magazin apar aici."
              />
            )
          }
          renderItem={({ item }) => <StockRow item={item} />}
        />
      )}
    </View>
  );
}

function StockRow({ item }: { item: StockInboundItem }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {[item.sku ? `SKU ${item.sku}` : null, `#${item.productId}`, item.storeName, formatWhen(item.importedAt)]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      <View style={styles.deltaBlock}>
        <Text style={styles.delta}>+{formatQty(item.delta)}</Text>
        <Text style={styles.deltaRange}>
          {formatQty(item.before)} → {formatQty(item.after)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 20, gap: 10, flexGrow: 1 },
  headerBlock: { gap: 12, marginBottom: 6 },
  summary: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 16,
    gap: 6,
  },
  summaryTitle: { color: colors.text, fontSize: typeScale.title, fontWeight: "800" },
  summaryMeta: { color: colors.muted, fontSize: typeScale.body, lineHeight: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 14,
  },
  rowBody: { flex: 1, minWidth: 0, gap: 4 },
  rowName: { color: colors.text, fontSize: typeScale.body, fontWeight: "800" },
  rowMeta: { color: colors.muted, fontSize: 15 },
  deltaBlock: { alignItems: "flex-end", gap: 2 },
  delta: { color: colors.successText, fontSize: typeScale.title, fontWeight: "800" },
  deltaRange: { color: colors.muted, fontSize: 15 },
});
