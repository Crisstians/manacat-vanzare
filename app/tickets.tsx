import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router, Stack } from "expo-router";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as floorApi from "../src/api/floorApi";
import type { CatalogProduct } from "../src/api/productsApi";
import type { FloorTicket, FloorTicketEvent, FloorTicketSummary } from "../src/api/types";
import { useAuth } from "../src/auth/AuthContext";
import { BarcodeScannerModal } from "../src/components/BarcodeScannerModal";
import { CatalogProductSearch } from "../src/components/CatalogProductSearch";
import { ticketSocket } from "../src/realtime/ticketSocket";
import { colors, radius, touchMin, typeScale } from "../src/theme";
import { Button } from "../src/ui/Button";
import { EmptyHint } from "../src/ui/EmptyHint";
import { ConnectionPill, StatusBanner } from "../src/ui/StatusBanner";
import { QuantityStepper } from "../src/ui/QuantityStepper";
import { displayUnit, inferUnitFromResults, parseQuantity, quantityKind } from "../src/units";

function newClientItemId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function lookupCodeCandidates(raw: string): string[] {
  const code = raw.trim();
  if (!code) return [];
  if (/^0\d{12}$/.test(code)) return [code, code.slice(1)];
  return [code];
}

function applyEvent(ticket: FloorTicket, event: FloorTicketEvent): FloorTicket {
  const payload = event.payload as Record<string, unknown>;
  if (event.type === "ticket.updated") {
    return { ...ticket, customerName: (payload.customerName as string | null) ?? null, lastSeq: event.seq };
  }
  if (event.type === "ticket.status_changed") {
    return { ...ticket, status: payload.to as FloorTicket["status"], lastSeq: event.seq };
  }
  if (event.type === "item.added") {
    if (ticket.items.some((item) => item.id === payload.itemId || item.clientItemId === payload.clientItemId)) {
      return { ...ticket, lastSeq: event.seq };
    }
    return {
      ...ticket,
      lastSeq: event.seq,
      items: [
        ...ticket.items,
        {
          id: String(payload.itemId),
          ticketId: ticket.id,
          productId: Number(payload.productId),
          sku: String(payload.sku ?? ""),
          nameSnapshot: String(payload.nameSnapshot ?? ""),
          quantity: Number(payload.quantity),
          addedByStaffId: String(payload.addedByStaffId ?? ""),
          addedByStaffName: String(payload.addedByStaffName ?? ""),
          addedAtDepartmentId: String(payload.addedAtDepartmentId ?? ""),
          addedAtDepartmentName: String(payload.addedAtDepartmentName ?? ""),
          clientItemId: String(payload.clientItemId ?? ""),
          createdAt: event.at,
          updatedAt: event.at,
        },
      ],
    };
  }
  if (event.type === "item.updated") {
    return {
      ...ticket,
      lastSeq: event.seq,
      items: ticket.items.map((item) =>
        item.id === payload.itemId ? { ...item, quantity: Number(payload.quantity) } : item,
      ),
    };
  }
  if (event.type === "item.removed") {
    return {
      ...ticket,
      lastSeq: event.seq,
      items: ticket.items.filter((item) => item.id !== payload.itemId),
    };
  }
  return { ...ticket, lastSeq: event.seq };
}

function addedByLabel(item: { addedByStaffName: string; addedAtDepartmentName: string }): string {
  const who = item.addedByStaffName.trim();
  const where = item.addedAtDepartmentName.trim();
  if (who && where) return `Adăugat de ${who} · ${where}`;
  if (who) return `Adăugat de ${who}`;
  if (where) return `Adăugat din ${where}`;
  return "";
}

export default function TicketsScreen() {
  const { device, session, logout } = useAuth();
  const [tickets, setTickets] = useState<FloorTicketSummary[]>([]);
  const [selected, setSelected] = useState<FloorTicket | null>(null);
  const [connected, setConnected] = useState(false);
  const [code, setCode] = useState("");
  const [qty, setQty] = useState("1");
  const [qtyUnit, setQtyUnit] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selected?.id ?? null;

  const loadList = useCallback(async () => {
    const all = await floorApi.listTickets();
    setTickets(all.filter((ticket) => ticket.status === "OPEN"));
  }, []);

  const dismissTicket = useCallback(() => {
    setSelected(null);
    setCustomerName("");
    ticketSocket.setTicket(null);
  }, []);

  useEffect(() => {
    if (!session) {
      router.replace("/login");
      return;
    }
    void loadList().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : "Eroare la încărcare"),
    );
    ticketSocket.connect(session.accessToken, {
      onConnection: setConnected,
      onTicketEvent: (event) => {
        void loadList();
        const leftBoard =
          event.type === "ticket.status_changed" &&
          (event.payload as { to?: string }).to !== "OPEN";
        if (leftBoard && selectedIdRef.current === event.ticketId) {
          dismissTicket();
          return;
        }
        setSelected((current) => {
          if (!current || current.id !== event.ticketId) return current;
          return applyEvent(current, event);
        });
      },
      onResync: (ticket) => {
        if (ticket.status !== "OPEN") {
          dismissTicket();
        } else {
          setSelected(ticket);
        }
        void loadList();
      },
    });
    return () => ticketSocket.disconnect();
  }, [dismissTicket, loadList, session]);

  const openTicket = async (id: string) => {
    setError(null);
    const ticket = await floorApi.getTicket(id);
    setSelected(ticket);
    setCustomerName(ticket.customerName ?? "");
    ticketSocket.setTicket(ticket.id, ticket.lastSeq);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const ticket = await floorApi.createTicket();
      await loadList();
      setSelected(ticket);
      setCustomerName("");
      ticketSocket.setTicket(ticket.id, ticket.lastSeq);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu s-a putut crea biletul");
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    if (!selected) return;
    try {
      const updated = await floorApi.updateTicket(selected.id, customerName.trim() || null);
      setSelected(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu s-a putut salva numele");
    }
  };

  const addProduct = async (rawCode = code, unitHint?: string | null) => {
    if (!selected || !rawCode.trim()) return;
    const candidates = lookupCodeCandidates(rawCode);
    setBusy(true);
    setError(null);
    try {
      let resolvedCode = candidates[0] ?? rawCode.trim();
      let unit = unitHint === null ? undefined : (unitHint ?? qtyUnit ?? undefined);
      if (!unit) {
        let lastError: unknown;
        let looked: Awaited<ReturnType<typeof floorApi.lookupProduct>> | null = null;
        for (const candidate of candidates) {
          try {
            looked = await floorApi.lookupProduct(candidate);
            resolvedCode = candidate;
            break;
          } catch (err) {
            lastError = err;
          }
        }
        if (!looked) {
          throw lastError instanceof Error ? lastError : new Error("Produsul nu a fost găsit");
        }
        unit = looked.unit;
      }
      const parsed = parseQuantity(qty, unit ? quantityKind(unit) : "other");
      if (!parsed.ok) {
        setError(parsed.message);
        return;
      }
      const updated = await floorApi.addItem(selected.id, {
        clientItemId: newClientItemId(),
        code: resolvedCode,
        quantity: parsed.value,
      });
      setSelected(updated);
      setCode("");
      setQty("1");
      setQtyUnit(null);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Produsul nu a fost găsit");
    } finally {
      setBusy(false);
    }
  };

  const addFromScan = (scanned: string) => {
    const data = scanned.trim();
    setScannerOpen(false);
    if (!data) return;
    setCode(data);
    void addProduct(data, null);
  };

  const addFromCatalog = (product: CatalogProduct) => {
    void addProduct(String(product.productId), product.unit);
  };

  const handleResultsChange = useCallback(
    (items: CatalogProduct[]) => {
      setQtyUnit(inferUnitFromResults(items, code));
    },
    [code],
  );

  const removeEmptyTicket = async () => {
    if (!selected || selected.items.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      await floorApi.changeStatus(selected.id, "CANCELLED");
      dismissTicket();
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu s-a putut șterge biletul");
    } finally {
      setBusy(false);
    }
  };

  const confirmRemoveEmptyTicket = () => {
    if (!selected || selected.items.length > 0) return;
    Alert.alert("Șterge biletul?", `${selected.displayNumber} nu are produse și va dispărea din listă.`, [
      { text: "Anulează", style: "cancel" },
      { text: "Șterge", style: "destructive", onPress: () => void removeEmptyTicket() },
    ]);
  };

  const confirmRemoveItem = (itemId: string, name: string) => {
    if (!selected) return;
    Alert.alert("Șterge linia?", name, [
      { text: "Anulează", style: "cancel" },
      {
        text: "Șterge",
        style: "destructive",
        onPress: () => {
          void floorApi.removeItem(selected.id, itemId).then(setSelected);
        },
      },
    ]);
  };

  const locked = selected?.status === "COMPLETED" || selected?.status === "CANCELLED";
  const isEmpty = (selected?.items.length ?? 0) === 0;
  const qtyKind = qtyUnit ? quantityKind(qtyUnit) : "other";
  const qtySuffix = qtyUnit ? displayUnit(qtyUnit) : "";

  useEffect(() => {
    if (qtyKind !== "piece") return;
    if (!/[.,]/.test(qty)) return;
    const whole = Math.floor(Number(qty.replace(",", ".")));
    setQty(Number.isFinite(whole) && whole > 0 ? String(whole) : "1");
  }, [qty, qtyKind]);
  const subtitle = useMemo(
    () => `${device?.departmentName ?? ""} · ${session?.staff.name ?? ""}`,
    [device?.departmentName, session?.staff.name],
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: subtitle,
          headerRight: () => (
            <Pressable
              onPress={() => void logout().then(() => router.replace("/login"))}
              style={styles.headerLogout}
              hitSlop={8}
            >
              <Text style={styles.headerLogoutText}>Ieșire</Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.split}>
        <View style={styles.listPane}>
          <View style={styles.listHeader}>
            <Text style={styles.paneTitle}>Bilete deschise</Text>
            <ConnectionPill connected={connected} />
          </View>
          <Button label="Bilet nou" onPress={() => void create()} disabled={busy} />
          <FlatList
            data={tickets}
            keyExtractor={(item) => item.id}
            style={styles.flex}
            contentContainerStyle={styles.ticketList}
            ListEmptyComponent={
              <Text style={styles.listEmpty}>Niciun bilet deschis. Apasă „Bilet nou”.</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                style={[styles.ticketRow, selected?.id === item.id && styles.ticketRowActive]}
                onPress={() => void openTicket(item.id)}
              >
                <Text style={styles.ticketNumber}>{item.displayNumber}</Text>
                <View style={styles.ticketMeta}>
                  <Text style={styles.ticketName}>{item.customerName ?? "Fără nume"}</Text>
                  <Text style={styles.status}>În lucru</Text>
                </View>
              </Pressable>
            )}
          />
        </View>

        <View style={styles.detailPane}>
          {!selected ? (
            <EmptyHint
              title="Deschide un bilet ca să adaugi produse"
              detail="Apasă „Bilet nou” în stânga sau alege un bilet din listă."
            />
          ) : (
            <>
              <View style={styles.detailHeader}>
                <Text style={styles.huge}>Bilet {selected.displayNumber}</Text>
                {isEmpty && !locked ? (
                  <Button
                    variant="danger"
                    label="Șterge biletul"
                    disabled={busy}
                    onPress={confirmRemoveEmptyTicket}
                  />
                ) : null}
              </View>

              <Text style={styles.fieldLabel}>Nume client — opțional</Text>
              <TextInput
                style={styles.input}
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="ex. Popescu"
                placeholderTextColor={colors.muted}
                editable={!locked}
                onEndEditing={() => void saveName()}
              />

              {!locked ? (
                <View style={styles.addCard}>
                  <Text style={styles.sectionTitle}>Adaugă produs</Text>
                  <CatalogProductSearch
                    query={code}
                    onQueryChange={setCode}
                    onSelect={addFromCatalog}
                    onResultsChange={handleResultsChange}
                    disabled={busy}
                  >
                    <Button
                      variant="secondary"
                      label="Scanare"
                      disabled={busy}
                      onPress={() => setScannerOpen(true)}
                    />
                  </CatalogProductSearch>
                  <View style={styles.addActions}>
                    <QuantityStepper
                      value={qty}
                      onChange={(value) => {
                        if (qtyKind === "piece") {
                          setQty(value.replace(/[^\d]/g, "") || "1");
                          return;
                        }
                        setQty(value);
                      }}
                      kind={qtyKind}
                      unitLabel={qtySuffix}
                      disabled={busy}
                    />
                    <Button
                      label="Adaugă"
                      onPress={() => void addProduct()}
                      disabled={busy}
                      loading={busy}
                      style={styles.addButton}
                    />
                  </View>
                </View>
              ) : null}

              {error ? <StatusBanner message={error} /> : null}

              <Text style={styles.sectionTitle}>
                {selected.items.length === 0
                  ? "Produse pe bilet"
                  : `Produse pe bilet (${selected.items.length})`}
              </Text>
              <FlatList
                data={selected.items}
                keyExtractor={(item) => item.id}
                style={styles.flex}
                contentContainerStyle={styles.lineList}
                ListEmptyComponent={
                  <Text style={styles.listEmpty}>Niciun produs încă. Caută sau scanează mai sus.</Text>
                }
                renderItem={({ item }) => {
                  const addedBy = addedByLabel(item);
                  return (
                  <View style={styles.line}>
                    <View style={styles.lineBody}>
                      <Text style={styles.lineName}>{item.nameSnapshot}</Text>
                      {addedBy ? <Text style={styles.lineMeta}>{addedBy}</Text> : null}
                    </View>
                    <Text style={styles.lineQty}>× {item.quantity}</Text>
                    {!locked ? (
                      <Button
                        variant="ghost"
                        label="Șterge"
                        onPress={() => confirmRemoveItem(item.id, item.nameSnapshot)}
                      />
                    ) : null}
                  </View>
                  );
                }}
              />
            </>
          )}
        </View>
      </View>
      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={addFromScan}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerLogout: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  headerLogoutText: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 18,
  },
  split: { flex: 1, flexDirection: "row" },
  listPane: {
    width: 340,
    borderRightWidth: 1.5,
    borderRightColor: colors.border,
    padding: 16,
    backgroundColor: colors.panel,
    gap: 12,
  },
  detailPane: { flex: 1, padding: 20, gap: 12 },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  paneTitle: { color: colors.text, fontSize: typeScale.title, fontWeight: "800", flex: 1 },
  ticketList: { gap: 10, paddingVertical: 4, flexGrow: 1 },
  ticketRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: radius,
    padding: 14,
    minHeight: touchMin,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  ticketRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  ticketNumber: { color: colors.text, fontSize: 28, fontWeight: "800", width: 64 },
  ticketMeta: { flex: 1 },
  ticketName: { color: colors.text, fontSize: typeScale.body, fontWeight: "700" },
  status: { color: colors.muted, fontSize: 15, marginTop: 2, fontWeight: "600" },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  huge: { color: colors.text, fontSize: typeScale.ticket, fontWeight: "800", flex: 1 },
  fieldLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: -4,
  },
  addCard: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  sectionTitle: { color: colors.text, fontSize: typeScale.title, fontWeight: "800" },
  addActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  addButton: { flexGrow: 1, minWidth: 160 },
  input: {
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
  lineList: { gap: 8, paddingBottom: 16, flexGrow: 1 },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    minHeight: touchMin,
  },
  lineBody: { flex: 1, minWidth: 0 },
  lineName: { color: colors.text, fontSize: typeScale.body, fontWeight: "800" },
  lineMeta: { color: colors.muted, fontSize: 15, marginTop: 2 },
  lineQty: { color: colors.accent, fontSize: 22, fontWeight: "800" },
  listEmpty: { color: colors.muted, fontSize: typeScale.body, lineHeight: 26 },
  flex: { flex: 1 },
});
