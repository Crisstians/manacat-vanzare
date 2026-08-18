import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router, Stack } from "expo-router";
import {
  Alert,
  AppState,
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
import { linkUnknownScannedCode, lookupCodeCandidates, resolveScannedProduct } from "../src/scan/productScan";
import { colors, pressedOpacity, radius, touchMin, typeScale } from "../src/theme";
import { Button } from "../src/ui/Button";
import { EmptyHint } from "../src/ui/EmptyHint";
import { HeaderLink } from "../src/ui/HeaderLink";
import { ConnectionPill, StatusBanner } from "../src/ui/StatusBanner";
import { QuantityStepper } from "../src/ui/QuantityStepper";
import {
  remainingStock,
  stockLimitMessage,
  ticketQtyForProduct,
} from "../src/stock";
import { displayUnit, inferUnitFromResults, parseQuantity, quantityKind } from "../src/units";

function newClientItemId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function toSummary(ticket: FloorTicket): FloorTicketSummary {
  const { items: _items, ...summary } = ticket;
  return summary;
}

function upsertBoardTicket(tickets: FloorTicketSummary[], next: FloorTicketSummary): FloorTicketSummary[] {
  if (!isBoardTicket(next.status)) {
    return tickets.filter((ticket) => ticket.id !== next.id);
  }
  const index = tickets.findIndex((ticket) => ticket.id === next.id);
  if (index === -1) return [next, ...tickets];
  const copy = tickets.slice();
  copy[index] = next;
  return copy;
}

function applyEventToList(tickets: FloorTicketSummary[], event: FloorTicketEvent): FloorTicketSummary[] {
  const payload = event.payload as Record<string, unknown>;
  const existing = tickets.find((ticket) => ticket.id === event.ticketId);

  if (event.type === "ticket.created") {
    const created: FloorTicketSummary = {
      id: event.ticketId,
      storeId: event.storeId,
      number: Number(payload.displayNumber) || existing?.number || 0,
      displayNumber: String(payload.displayNumber ?? existing?.displayNumber ?? ""),
      customerName: (payload.customerName as string | null) ?? existing?.customerName ?? null,
      status: existing?.status ?? "OPEN",
      createdByStaffId: String(payload.createdByStaffId ?? existing?.createdByStaffId ?? ""),
      createdByStaffName: existing?.createdByStaffName ?? "",
      createdAtDepartmentId: String(payload.createdAtDepartmentId ?? existing?.createdAtDepartmentId ?? ""),
      createdAtDepartmentName: existing?.createdAtDepartmentName ?? "",
      createdAt: existing?.createdAt ?? event.at,
      updatedAt: event.at,
      lastSeq: event.seq,
    };
    return upsertBoardTicket(tickets, created);
  }

  if (event.type === "ticket.status_changed") {
    const to = payload.to as FloorTicketStatus;
    if (!isBoardTicket(to)) {
      return tickets.filter((ticket) => ticket.id !== event.ticketId);
    }
    if (!existing) return tickets;
    return upsertBoardTicket(tickets, { ...existing, status: to, lastSeq: event.seq, updatedAt: event.at });
  }

  if (!existing) return tickets;

  if (event.type === "ticket.updated") {
    return upsertBoardTicket(tickets, {
      ...existing,
      customerName: (payload.customerName as string | null) ?? null,
      lastSeq: event.seq,
      updatedAt: event.at,
    });
  }

  return upsertBoardTicket(tickets, { ...existing, lastSeq: event.seq, updatedAt: event.at });
}

function applyEvent(ticket: FloorTicket, event: FloorTicketEvent): FloorTicket {
  const payload = event.payload as Record<string, unknown>;
  if (event.type === "ticket.created") {
    return { ...ticket, lastSeq: event.seq };
  }
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

function formatQty(quantity: number): string {
  if (!Number.isFinite(quantity)) return "—";
  if (Number.isInteger(quantity)) return String(quantity);
  return quantity.toFixed(3).replace(/\.?0+$/, "").replace(".", ",");
}

function isNumericCode(raw: string): boolean {
  return /^\d+$/.test(raw.trim());
}

type PendingProduct = {
  code: string;
  name: string;
  unit: string;
  productId: number;
};

export default function TicketsScreen() {
  const { device, session } = useAuth();
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
  const [pendingProduct, setPendingProduct] = useState<PendingProduct | null>(null);
  const [unitByProductId, setUnitByProductId] = useState<Record<number, string>>({});
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  selectedIdRef.current = selected?.id ?? null;

  const rememberUnit = useCallback((productId: number, unit: string) => {
    if (!unit) return;
    setUnitByProductId((current) => (current[productId] === unit ? current : { ...current, [productId]: unit }));
  }, []);

  const flashAdded = useCallback((itemId: string) => {
    setJustAddedId(itemId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setJustAddedId((current) => (current === itemId ? null : current));
      highlightTimerRef.current = null;
    }, 1600);
  }, []);

  const loadList = useCallback(async () => {
    const all = await floorApi.listTickets();
    setTickets(all.filter((ticket) => isBoardTicket(ticket.status)));
  }, []);

  const dismissTicket = useCallback(() => {
    setSelected(null);
    setCustomerName("");
    setEditingItemId(null);
    setPendingProduct(null);
    setJustAddedId(null);
    ticketSocket.setTicket(null);
  }, []);

  useEffect(() => {
    if (!session) {
      router.replace("/login");
      return;
    }
    const handleLoadError = (err: unknown) =>
      setError(err instanceof Error ? err.message : "Eroare la încărcare");

    const refreshOpenTicket = async () => {
      const id = selectedIdRef.current;
      if (!id) return;
      try {
        const ticket = await floorApi.getTicket(id);
        if (!isBoardTicket(ticket.status)) {
          dismissTicket();
          setTickets((current) => current.filter((row) => row.id !== ticket.id));
          return;
        }
        ticketSocket.setTicket(ticket.id, ticket.lastSeq);
        setSelected(ticket);
        setCustomerName(ticket.customerName ?? "");
        setTickets((current) => upsertBoardTicket(current, toSummary(ticket)));
      } catch {
        // keep the current view if the snapshot fails
      }
    };

    void loadList().catch(handleLoadError);
    ticketSocket.connect(session.accessToken, session.staff.storeId, {
      onConnection: setConnected,
      onReconnect: () => {
        void loadList().catch(handleLoadError);
        void refreshOpenTicket();
      },
      onTicketEvent: (event) => {
        const payload = event.payload as Record<string, unknown>;
        const leftBoard =
          event.type === "ticket.status_changed" &&
          !isBoardTicket((payload.to as FloorTicketStatus | undefined) ?? "OPEN");
        if (leftBoard && selectedIdRef.current === event.ticketId) {
          dismissTicket();
        } else if (selectedIdRef.current === event.ticketId) {
          if (event.type === "ticket.updated") {
            setCustomerName((payload.customerName as string | null) ?? "");
          }
          if (event.type === "item.added" && payload.itemId) {
            flashAdded(String(payload.itemId));
          }
          setSelected((current) => {
            if (!current || current.id !== event.ticketId) return current;
            return applyEvent(current, event);
          });
        }
        setTickets((current) => applyEventToList(current, event));
      },
      onResync: (ticket) => {
        if (!isBoardTicket(ticket.status)) {
          if (selectedIdRef.current === ticket.id) dismissTicket();
          setTickets((current) => current.filter((row) => row.id !== ticket.id));
          return;
        }
        if (selectedIdRef.current === ticket.id) {
          setSelected(ticket);
          setCustomerName(ticket.customerName ?? "");
        }
        setTickets((current) => upsertBoardTicket(current, toSummary(ticket)));
      },
    });

    const appState = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      void loadList().catch(handleLoadError);
      void refreshOpenTicket();
    });

    return () => {
      appState.remove();
      ticketSocket.disconnect();
    };
  }, [dismissTicket, flashAdded, loadList, session]);

  const openTicket = async (id: string) => {
    setError(null);
    const ticket = await floorApi.getTicket(id);
    setSelected(ticket);
    setCustomerName(ticket.customerName ?? "");
    setTickets((current) => upsertBoardTicket(current, toSummary(ticket)));
    ticketSocket.setTicket(ticket.id, ticket.lastSeq);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const ticket = await floorApi.createTicket();
      setTickets((current) => upsertBoardTicket(current, toSummary(ticket)));
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
      ticketSocket.noteSeq(updated.id, updated.lastSeq);
      setSelected(updated);
      setTickets((current) => upsertBoardTicket(current, toSummary(updated)));
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
      const previousIds = new Set(selected.items.map((item) => item.id));
      const added = updated.items.find((item) => !previousIds.has(item.id));
      ticketSocket.noteSeq(updated.id, updated.lastSeq);
      setSelected(updated);
      setTickets((current) => upsertBoardTicket(current, toSummary(updated)));
      setCode("");
      setQty("1");
      setQtyUnit(null);
      setPendingProduct(null);
      rememberUnit(looked.productId, looked.unit);
      if (added) flashAdded(added.id);
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

  const selectFromCatalog = (product: CatalogProduct) => {
    if (!selected) return;
    const name = product.nameAlt.trim() || product.name.trim() || product.sku;
    setPendingProduct({
      code: String(product.productId),
      name,
      unit: product.unit,
      productId: product.productId,
    });
    setCode(name);
    setQtyUnit(product.unit);
    rememberUnit(product.productId, product.unit);
    setError(null);
  };

  const handleQueryChange = (next: string) => {
    setCode(next);
    setPendingProduct((current) => (current && next !== current.name ? null : current));
  };

  const handleResultsChange = useCallback(
    (items: CatalogProduct[]) => {
      if (items.length === 0) return;
      setQtyUnit(inferUnitFromResults(items, code));
      setUnitByProductId((current) => {
        let changed = false;
        const next = { ...current };
        for (const item of items) {
          if (item.unit && next[item.productId] !== item.unit) {
            next[item.productId] = item.unit;
            changed = true;
          }
        }
        return changed ? next : current;
      });
    },
    [code],
  );

  const removeEmptyTicket = async () => {
    if (!selected || selected.items.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const ticketId = selected.id;
      await floorApi.changeStatus(ticketId, "CANCELLED");
      dismissTicket();
      setTickets((current) => current.filter((ticket) => ticket.id !== ticketId));
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
          void floorApi.removeItem(selected.id, itemId).then((updated) => {
            ticketSocket.noteSeq(updated.id, updated.lastSeq);
            setSelected(updated);
          });
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
        rememberUnit(item.productId, looked.unit);
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
      ticketSocket.noteSeq(updated.id, updated.lastSeq);
      setSelected(updated);
      setTickets((current) => upsertBoardTicket(current, toSummary(updated)));
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
    setPendingProduct(null);
  }, [selected?.id]);

  useEffect(() => {
    if (!selected || canEditItems(selected.status)) return;
    setScannerOpen(false);
    setEditingItemId(null);
  }, [selected]);

  useEffect(() => {
    if (qtyKind !== "piece") return;
    if (!/[.,]/.test(qty)) return;
    const whole = Math.floor(Number(qty.replace(",", ".")));
    setQty(Number.isFinite(whole) && whole > 0 ? String(whole) : "1");
  }, [qty, qtyKind]);
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  const canAdd = Boolean(pendingProduct) || isNumericCode(code);
  const subtitle = useMemo(
    () => `${device?.departmentName ?? ""} · ${session?.staff.name ?? ""}`,
    [device?.departmentName, session?.staff.name],
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: subtitle,
          headerLeft: () => <HeaderLink label="Înapoi" onPress={() => router.replace("/home")} />,
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
                android_ripple={{ color: "rgba(0,0,0,0.08)" }}
                style={({ pressed }) => [
                  styles.ticketRow,
                  selected?.id === item.id && styles.ticketRowActive,
                  item.status === "READY" && styles.ticketRowReady,
                  pressed && { opacity: pressedOpacity },
                ]}
                onPress={() => void openTicket(item.id)}
              >
                <Text style={styles.ticketNumber}>{item.displayNumber}</Text>
                <View style={styles.ticketMeta}>
                  {item.customerName?.trim() ? (
                    <Text style={styles.ticketName}>{item.customerName.trim()}</Text>
                  ) : null}
                  <View
                    style={[
                      styles.statusPill,
                      item.status === "READY" ? styles.statusPillReady : styles.statusPillOpen,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        item.status === "READY" && styles.statusPillTextReady,
                      ]}
                    >
                      {statusLabel(item.status)}
                    </Text>
                  </View>
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
                    onQueryChange={handleQueryChange}
                    onSelect={selectFromCatalog}
                    onResultsChange={handleResultsChange}
                    disabled={busy}
                    storeId={session?.staff.storeId ?? device?.storeId}
                    selectedProductId={pendingProduct?.productId}
                  >
                    <Button
                      variant="secondary"
                      label="Scanare"
                      disabled={busy}
                      onPress={() => setScannerOpen(true)}
                    />
                  </CatalogProductSearch>
                  {pendingProduct ? (
                    <View style={styles.pendingRow}>
                      <Text style={styles.pendingName} numberOfLines={2}>
                        {pendingProduct.name}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Schimbă produsul"
                        onPress={() => {
                          setPendingProduct(null);
                          setCode("");
                          setQtyUnit(null);
                        }}
                        style={({ pressed }) => [styles.pendingClear, pressed && { opacity: pressedOpacity }]}
                      >
                        <Text style={styles.pendingClearText}>Schimbă</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={styles.stockHint}>
                      Alege un produs din listă sau scanează, apoi apasă „Adaugă”.
                    </Text>
                  )}
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
                      onPress={() => void addProduct(pendingProduct?.code ?? code, pendingProduct?.unit)}
                      disabled={busy || !canAdd}
                      loading={busy}
                      style={styles.addButton}
                    />
                  </View>
                  <Text style={styles.stockHint}>
                    Cantitatea e limitată la stocul acestui magazin, inclusiv ce e deja pe biletele deschise.
                  </Text>
                </View>
              ) : null}

              {error ? <StatusBanner message={error} onDismiss={() => setError(null)} /> : null}

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
                  const unit = unitByProductId[item.productId];
                  const qtyLabel = unit
                    ? `${formatQty(item.quantity)} ${displayUnit(unit)}`
                    : formatQty(item.quantity);
                  return (
                  <View style={[styles.line, justAddedId === item.id && styles.lineAdded]}>
                    <View style={styles.lineMain}>
                      <View style={styles.lineBody}>
                        <Text style={styles.lineName}>{item.nameSnapshot}</Text>
                        {addedBy ? <Text style={styles.lineMeta}>{addedBy}</Text> : null}
                      </View>
                      {!editing ? (
                        !locked ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Modifică cantitatea"
                          disabled={busy}
                          onPress={() => startEditQuantity(item)}
                          android_ripple={{ color: "rgba(0,0,0,0.08)" }}
                          style={({ pressed }) => [
                            styles.qtyTap,
                            pressed && { opacity: pressedOpacity },
                          ]}
                        >
                          <Text style={styles.lineQty}>{qtyLabel}</Text>
                        </Pressable>
                        ) : (
                        <Text style={styles.lineQty}>{qtyLabel}</Text>
                        )
                      ) : null}
                      {!locked && !editing ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Șterge ${item.nameSnapshot}`}
                          disabled={busy}
                          onPress={() => confirmRemoveItem(item.id, item.nameSnapshot)}
                          style={({ pressed }) => [
                            styles.lineDelete,
                            pressed && { opacity: pressedOpacity },
                            busy && styles.lineDeleteDisabled,
                          ]}
                        >
                          <Text style={styles.lineDeleteText}>Șterge</Text>
                        </Pressable>
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
        storeId={session?.staff.storeId ?? device?.storeId}
        linkUnknownCode={linkUnknownScannedCode}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
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
    overflow: "hidden",
  },
  ticketRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  ticketRowReady: {
    borderColor: colors.info,
  },
  ticketNumber: { color: colors.text, fontSize: 28, fontWeight: "800", flexShrink: 0 },
  ticketMeta: { flex: 1, gap: 6 },
  ticketName: { color: colors.text, fontSize: typeScale.body, fontWeight: "700" },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1.5,
  },
  statusPillOpen: {
    backgroundColor: colors.panelAlt,
    borderColor: colors.border,
  },
  statusPillReady: {
    backgroundColor: colors.infoSoft,
    borderColor: colors.info,
  },
  statusPillText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "800",
  },
  statusPillTextReady: { color: colors.info },
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
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.accentSoft,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: touchMin,
  },
  pendingName: {
    flex: 1,
    color: colors.text,
    fontSize: typeScale.body,
    fontWeight: "800",
  },
  pendingClear: {
    minHeight: touchMin - 8,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  pendingClearText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: "800",
  },
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
  lineAdded: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  lineMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: touchMin,
  },
  lineBody: { flex: 1, minWidth: 0 },
  lineName: { color: colors.text, fontSize: typeScale.body, fontWeight: "800" },
  lineMeta: { color: colors.muted, fontSize: 15, marginTop: 2 },
  lineQty: { color: colors.accent, fontSize: 22, fontWeight: "800" },
  qtyTap: {
    minHeight: touchMin,
    minWidth: touchMin,
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "flex-end",
    borderRadius: radius,
    overflow: "hidden",
  },
  lineDelete: {
    minHeight: touchMin,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  lineDeleteText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: "800",
  },
  lineDeleteDisabled: { opacity: 0.4 },
  lineEdit: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
  listEmpty: { color: colors.muted, fontSize: typeScale.body, lineHeight: 26 },
  flex: { flex: 1 },
});
