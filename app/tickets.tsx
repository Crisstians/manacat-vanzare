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
import type { FloorTicket, FloorTicketEvent, FloorTicketStatus, FloorTicketSummary } from "../src/api/types";
import { useAuth } from "../src/auth/AuthContext";
import { BarcodeScannerModal, type ScannedBarcodeProduct } from "../src/components/BarcodeScannerModal";
import { CatalogProductSearch } from "../src/components/CatalogProductSearch";
import { ticketSocket } from "../src/realtime/ticketSocket";
import { colors, radius, touchMin, typeScale } from "../src/theme";
import { Button } from "../src/ui/Button";
import { EmptyHint } from "../src/ui/EmptyHint";
import { ConnectionPill, StatusBanner } from "../src/ui/StatusBanner";
import { QuantityStepper } from "../src/ui/QuantityStepper";
import {
  remainingStock,
  stockAtStore,
  stockLimitMessage,
  otherStoreNamesWithStock,
  ticketQtyForProduct,
} from "../src/stock";
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

async function resolveScannedProduct(raw: string): Promise<ScannedBarcodeProduct> {
  const candidates = lookupCodeCandidates(raw.trim());
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const looked = await floorApi.lookupProduct(candidate);
      const name = looked.name.trim() || looked.sku.trim() || candidate;
      return { code: candidate, name, unit: looked.unit };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Produsul nu a fost găsit");
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

function isBoardTicket(status: FloorTicketStatus): boolean {
  return status === "OPEN" || status === "READY";
}

function canEditItems(status: FloorTicketStatus): boolean {
  return status === "OPEN";
}

function statusLabel(status: FloorTicketStatus): string {
  if (status === "READY") return "La casă";
  if (status === "COMPLETED") return "Predat";
  if (status === "CANCELLED") return "Anulat";
  return "În lucru";
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
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("1");
  const [editUnit, setEditUnit] = useState<string | null>(null);
  const [editRemaining, setEditRemaining] = useState<number | null>(null);
  const [editOtherStores, setEditOtherStores] = useState<string[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selected?.id ?? null;

  const loadList = useCallback(async () => {
    const all = await floorApi.listTickets();
    setTickets(all.filter((ticket) => isBoardTicket(ticket.status)));
  }, []);

  const dismissTicket = useCallback(() => {
    setSelected(null);
    setCustomerName("");
    setEditingItemId(null);
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
          !isBoardTicket(((event.payload as { to?: FloorTicketStatus }).to ?? "OPEN"));
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
        if (!isBoardTicket(ticket.status)) {
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
    if (!canEditItems(selected.status)) {
      setError("Biletul este la casă. Nu se mai pot adăuga produse.");
      return;
    }
    const candidates = lookupCodeCandidates(rawCode);
    setBusy(true);
    setError(null);
    try {
      let lastError: unknown;
      let looked: Awaited<ReturnType<typeof floorApi.lookupProduct>> | null = null;
      let resolvedCode = candidates[0] ?? rawCode.trim();
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
      const unit = unitHint || looked.unit;
      const parsed = parseQuantity(qty, unit ? quantityKind(unit) : "other");
      if (!parsed.ok) {
        setError(parsed.message);
        return;
      }
      const remaining = remainingStock(
        looked.storeStock,
        ticketQtyForProduct(selected.items, looked.productId),
      );
      if (parsed.value > remaining + 1e-9) {
        setError(
          stockLimitMessage({
            remaining,
            storeStock: looked.storeStock,
            productName: looked.name,
            unit: looked.unit,
            otherStoreNames: looked.otherStoreNames,
          }),
        );
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

  const confirmScannedProduct = (product: ScannedBarcodeProduct) => {
    setScannerOpen(false);
    setCode(product.code);
    void addProduct(product.code, product.unit);
  };

  const addFromCatalog = (product: CatalogProduct) => {
    if (!selected) return;
    const storeId = session?.staff.storeId ?? device?.storeId ?? "";
    const storeStock = stockAtStore(product.stockByStore, storeId);
    const remaining = remainingStock(storeStock, ticketQtyForProduct(selected.items, product.productId));
    const name = product.nameAlt.trim() || product.name.trim() || product.sku;
    const parsed = parseQuantity(qty, quantityKind(product.unit));
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    if (parsed.value > remaining + 1e-9) {
      setError(
        stockLimitMessage({
          remaining,
          storeStock,
          productName: name,
          unit: product.unit,
          otherStoreNames: otherStoreNamesWithStock(product.stockByStore, storeId),
        }),
      );
      return;
    }
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
    if (!selected || !canEditItems(selected.status)) return;
    Alert.alert("Șterge linia?", name, [
      { text: "Anulează", style: "cancel" },
      {
        text: "Șterge",
        style: "destructive",
        onPress: () => {
          setEditingItemId((current) => (current === itemId ? null : current));
          void floorApi.removeItem(selected.id, itemId).then(setSelected);
        },
      },
    ]);
  };

  const startEditQuantity = (item: FloorTicket["items"][number]) => {
    if (!selected || !canEditItems(selected.status)) return;
    setError(null);
    setEditingItemId(item.id);
    setEditQty(String(item.quantity));
    setEditUnit("buc");
    setEditRemaining(null);
    setEditOtherStores([]);
    void floorApi
      .lookupProduct(String(item.productId))
      .then((looked) => {
        setEditUnit(looked.unit);
        setEditRemaining(
          remainingStock(looked.storeStock, ticketQtyForProduct(selected.items, item.productId, item.id)),
        );
        setEditOtherStores(looked.otherStoreNames ?? []);
      })
      .catch(() => {
        /* rămâne stepper-ul pe bucăți */
      });
  };

  const saveEditQuantity = async () => {
    if (!selected || !editingItemId || !canEditItems(selected.status)) return;
    const kind = editUnit ? quantityKind(editUnit) : Number.isInteger(Number(editQty.replace(",", "."))) ? "piece" : "other";
    const parsed = parseQuantity(editQty, kind);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    if (editRemaining != null && parsed.value > editRemaining + 1e-9) {
      setError(
        stockLimitMessage({
          remaining: editRemaining,
          storeStock: editRemaining,
          unit: editUnit ?? undefined,
          otherStoreNames: editOtherStores,
        }),
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await floorApi.updateItem(selected.id, editingItemId, parsed.value);
      setSelected(updated);
      setEditingItemId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu s-a putut modifica cantitatea");
    } finally {
      setBusy(false);
    }
  };

  const locked = !selected || !canEditItems(selected.status);
  const atCheckout = selected?.status === "READY";
  const isEmpty = (selected?.items.length ?? 0) === 0;
  const qtyKind = qtyUnit ? quantityKind(qtyUnit) : "other";
  const qtySuffix = qtyUnit ? displayUnit(qtyUnit) : "";
  const editQtyKind = editUnit ? quantityKind(editUnit) : "other";
  const editQtySuffix = editUnit ? displayUnit(editUnit) : "";

  useEffect(() => {
    setEditingItemId(null);
  }, [selected?.id]);

  useEffect(() => {
    if (!locked) return;
    setScannerOpen(false);
    setEditingItemId(null);
  }, [locked]);

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
                style={[
                  styles.ticketRow,
                  selected?.id === item.id && styles.ticketRowActive,
                  item.status === "READY" && styles.ticketRowReady,
                ]}
                onPress={() => void openTicket(item.id)}
              >
                <Text style={styles.ticketNumber}>{item.displayNumber}</Text>
                <View style={styles.ticketMeta}>
                  <Text style={styles.ticketName}>{item.customerName ?? "Fără nume"}</Text>
                  <Text style={[styles.status, item.status === "READY" && styles.statusReady]}>
                    {statusLabel(item.status)}
                  </Text>
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
                editable={isBoardTicket(selected.status)}
                onEndEditing={() => void saveName()}
              />

              {atCheckout ? (
                <StatusBanner
                  tone="info"
                  message="Biletul este la casă. Nu se mai pot adăuga sau scoate produse."
                />
              ) : null}

              {!locked ? (
                <View style={styles.addCard}>
                  <Text style={styles.sectionTitle}>Adaugă produs</Text>
                  <CatalogProductSearch
                    query={code}
                    onQueryChange={setCode}
                    onSelect={addFromCatalog}
                    onResultsChange={handleResultsChange}
                    disabled={busy}
                    storeId={session?.staff.storeId ?? device?.storeId}
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
                  <Text style={styles.stockHint}>
                    Cantitatea e limitată la stocul acestui magazin, inclusiv ce e deja pe biletele deschise.
                  </Text>
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
                  <Text style={styles.listEmpty}>
                    {atCheckout
                      ? "Niciun produs pe bilet."
                      : "Niciun produs încă. Caută sau scanează mai sus."}
                  </Text>
                }
                renderItem={({ item }) => {
                  const addedBy = addedByLabel(item);
                  const editing = editingItemId === item.id;
                  return (
                  <View style={styles.line}>
                    <View style={styles.lineMain}>
                      <View style={styles.lineBody}>
                        <Text style={styles.lineName}>{item.nameSnapshot}</Text>
                        {addedBy ? <Text style={styles.lineMeta}>{addedBy}</Text> : null}
                      </View>
                      <Text style={styles.lineQty}>× {item.quantity}</Text>
                      {!locked && !editing ? (
                        <View style={styles.lineActions}>
                          <Button
                            variant="secondary"
                            label="Modifică cantitatea"
                            disabled={busy}
                            onPress={() => startEditQuantity(item)}
                          />
                          <Button
                            variant="ghost"
                            label="Șterge"
                            disabled={busy}
                            onPress={() => confirmRemoveItem(item.id, item.nameSnapshot)}
                          />
                        </View>
                      ) : null}
                    </View>
                    {editing ? (
                      <View style={styles.lineEdit}>
                        <QuantityStepper
                          value={editQty}
                          onChange={(value) => {
                            if (editQtyKind === "piece") {
                              setEditQty(value.replace(/[^\d]/g, "") || "1");
                              return;
                            }
                            setEditQty(value);
                          }}
                          kind={editQtyKind}
                          unitLabel={editQtySuffix}
                          disabled={busy}
                          max={editRemaining ?? undefined}
                        />
                        <Button
                          label="Salvează"
                          disabled={busy}
                          loading={busy}
                          onPress={() => void saveEditQuantity()}
                        />
                        <Button
                          variant="ghost"
                          label="Anulează"
                          disabled={busy}
                          onPress={() => setEditingItemId(null)}
                        />
                      </View>
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
        resolveProduct={resolveScannedProduct}
        onConfirm={confirmScannedProduct}
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
  ticketRowReady: {
    borderColor: colors.info,
  },
  ticketNumber: { color: colors.text, fontSize: 28, fontWeight: "800", width: 64 },
  ticketMeta: { flex: 1 },
  ticketName: { color: colors.text, fontSize: typeScale.body, fontWeight: "700" },
  status: { color: colors.muted, fontSize: 15, marginTop: 2, fontWeight: "600" },
  statusReady: { color: colors.info, fontWeight: "800" },
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
  stockHint: { color: colors.muted, fontSize: 15, fontWeight: "600", lineHeight: 22 },
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
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 12,
  },
  lineMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: touchMin,
  },
  lineBody: { flex: 1, minWidth: 0 },
  lineName: { color: colors.text, fontSize: typeScale.body, fontWeight: "800" },
  lineMeta: { color: colors.muted, fontSize: 15, marginTop: 2 },
  lineQty: { color: colors.accent, fontSize: 22, fontWeight: "800" },
  lineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  lineEdit: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
  listEmpty: { color: colors.muted, fontSize: typeScale.body, lineHeight: 26 },
  flex: { flex: 1 },
});
