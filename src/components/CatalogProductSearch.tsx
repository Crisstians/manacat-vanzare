import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { searchProducts, type CatalogProduct } from "../api/productsApi";
import { apiOrigin } from "../config";
import { formatStockAmount, otherStockHint, otherStoreNamesWithStock, stockAtStore } from "../stock";
import { colors, radius, touchMin, typeScale } from "../theme";
import { displayUnit } from "../units";

const DEBOUNCE_MS = 300;
const RESULT_LIMIT = 20;
const RESULTS_MAX_HEIGHT = 300;

type CatalogProductSearchProps = {
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (product: CatalogProduct) => void;
  onResultsChange?: (items: CatalogProduct[]) => void;
  disabled?: boolean;
  storeId?: string;
  children?: ReactNode;
};

export function shouldTriggerCatalogSearch(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  if (/^\d+$/.test(trimmed)) return trimmed.length >= 1;
  return trimmed.length >= 2;
}

function catalogDisplayName(product: CatalogProduct): string {
  const alt = product.nameAlt?.trim();
  if (alt) return alt;
  const name = product.name?.trim();
  if (name) return name;
  return `Produs #${product.productId}`;
}

function catalogPrimaryImage(product: CatalogProduct): string {
  const primary = product.image?.trim();
  if (primary) return resolveMediaUrl(primary);
  const first = product.images?.find((url) => url?.trim());
  return first ? resolveMediaUrl(first.trim()) : "";
}

function resolveMediaUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const origin = apiOrigin();
  return `${origin}${url.startsWith("/") ? url : `/${url}`}`;
}

function formatPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "—";
  return `${price.toFixed(2)} lei`;
}

export function CatalogProductSearch({
  query,
  onQueryChange,
  onSelect,
  onResultsChange,
  disabled,
  storeId,
  children,
}: CatalogProductSearchProps) {
  const abortRef = useRef<AbortController | null>(null);
  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!shouldTriggerCatalogSearch(query)) {
      abortRef.current?.abort();
      abortRef.current = null;
      setItems([]);
      setError(null);
      setLoading(false);
      setSearched(false);
      return;
    }

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);

      void searchProducts(query, { limit: RESULT_LIMIT, signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          setItems(result.items);
          setSearched(true);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : "Căutarea a eșuat.");
          setItems([]);
          setSearched(true);
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [query]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    onResultsChange?.(items);
  }, [items, onResultsChange]);

  const canSearch = shouldTriggerCatalogSearch(query);
  const showHint = !loading && !error && query.trim().length > 0 && !canSearch;
  const showEmpty = !loading && !error && searched && items.length === 0;
  const showResults = !loading && !error && items.length > 0;
  const showPanel = loading || Boolean(error) || showHint || showEmpty || showResults;

  let resultsPanel = null;
  if (showPanel) {
    let panelBody = null;
    if (loading) {
      panelBody = (
        <View style={styles.statusRow}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.statusLabel}>Se caută…</Text>
        </View>
      );
    } else if (error) {
      panelBody = <Text style={styles.errorText}>{error}</Text>;
    } else if (showHint) {
      panelBody = (
        <Text style={styles.statusText}>Tastează cod, SKU sau cel puțin 2 litere din nume.</Text>
      );
    } else if (showEmpty) {
      panelBody = <Text style={styles.statusText}>Niciun produs găsit.</Text>;
    } else if (showResults) {
      panelBody = (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          style={styles.resultsList}
        >
          {items.map((item, index) => {
            const title = catalogDisplayName(item);
            const thumb = catalogPrimaryImage(item);
            const storeStock = storeId ? stockAtStore(item.stockByStore, storeId) : null;
            const outOfStock = storeStock != null && storeStock <= 0;
            const elsewhere =
              outOfStock && storeId ? otherStockHint(otherStoreNamesWithStock(item.stockByStore, storeId)) : "";
            const meta = [
              item.sku ? `SKU ${item.sku}` : null,
              `#${item.productId}`,
              item.brand?.trim() || null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <Pressable
                key={item.productId}
                style={[
                  styles.resultRow,
                  index > 0 && styles.resultRowBorder,
                  outOfStock && styles.resultRowDisabled,
                ]}
                disabled={disabled || outOfStock}
                onPress={() => onSelect(item)}
              >
                <View style={styles.thumb}>
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={styles.thumbImage} />
                  ) : (
                    <Text style={styles.thumbFallback}>Fără poză</Text>
                  )}
                </View>
                <View style={styles.resultBody}>
                  <Text style={styles.resultTitle} numberOfLines={2}>
                    {title}
                  </Text>
                  <Text style={styles.resultMeta} numberOfLines={1}>
                    {meta}
                  </Text>
                  {storeStock != null ? (
                    <Text
                      style={[styles.resultStock, outOfStock && styles.resultStockOut]}
                      numberOfLines={3}
                    >
                      {outOfStock
                        ? `Fără stoc la acest magazin.${elsewhere}`
                        : `Stoc magazin: ${formatStockAmount(storeStock, item.unit)}`}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.resultPrice}>
                  {formatPrice(item.price)}
                  {item.unit ? `/${displayUnit(item.unit)}` : ""}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      );
    }

    resultsPanel = (
      <View style={styles.results} accessibilityRole="list">
        {panelBody}
      </View>
    );
  }

  return (
    <View>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={onQueryChange}
          placeholder="Caută după nume, SKU sau cod…"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          autoCapitalize="none"
          editable={!disabled}
          returnKeyType="search"
        />
        {children}
      </View>
      {resultsPanel}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  input: {
    flex: 1,
    minHeight: touchMin,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius,
    color: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: typeScale.body,
  },
  results: {
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius,
    backgroundColor: colors.panel,
    overflow: "hidden",
  },
  resultsList: { maxHeight: RESULTS_MAX_HEIGHT },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  statusLabel: { color: colors.muted, fontSize: 16 },
  statusText: {
    color: colors.muted,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  errorText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  resultRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.panelAlt,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImage: { width: "100%", height: "100%" },
  thumbFallback: { color: colors.muted, fontSize: 14, textAlign: "center", paddingHorizontal: 4 },
  resultBody: { flex: 1, minWidth: 0 },
  resultTitle: { color: colors.text, fontSize: typeScale.body, fontWeight: "800" },
  resultMeta: { color: colors.muted, fontSize: 15, marginTop: 4 },
  resultStock: { color: colors.successText, fontSize: 15, fontWeight: "700", marginTop: 4 },
  resultStockOut: { color: colors.danger },
  resultRowDisabled: { opacity: 0.55 },
  resultPrice: { color: colors.text, fontSize: 16, fontWeight: "700" },
});
