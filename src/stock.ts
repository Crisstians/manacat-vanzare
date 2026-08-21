import { displayUnit, formatQuantityDisplay, quantityKind } from "./units";

export type StoreStockLine = {
  storeId: string;
  storeName?: string;
  quantity: number;
  price?: number;
  priceExVat?: number;
};

export function stockAtStore(stockByStore: StoreStockLine[] | undefined, storeId: string): number {
  if (!stockByStore || !storeId) return 0;
  return stockByStore.find((row) => row.storeId === storeId)?.quantity ?? 0;
}

export function priceAtStore(
  stockByStore: StoreStockLine[] | undefined,
  storeId: string,
  fallback: number,
): number {
  if (!stockByStore || !storeId) return fallback;
  const price = stockByStore.find((row) => row.storeId === storeId)?.price;
  if (typeof price === "number" && Number.isFinite(price) && price > 0) return price;
  return fallback;
}

export function otherStoreNamesWithStock(
  stockByStore: StoreStockLine[] | undefined,
  currentStoreId: string,
): string[] {
  if (!stockByStore) return [];
  return stockByStore
    .filter((row) => row.storeId !== currentStoreId && row.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity || (a.storeName ?? "").localeCompare(b.storeName ?? "", "ro"))
    .map((row) => row.storeName?.trim() || row.storeId)
    .filter(Boolean);
}

export function otherStockHint(storeNames: string[]): string {
  if (storeNames.length === 0) return "";
  const shown = storeNames.slice(0, 4);
  const rest = storeNames.length - shown.length;
  const list = shown.join(", ");
  const extra = rest > 0 ? ` și încă ${rest}` : "";
  return ` Există stoc la alte puncte de lucru precum ${list}${extra}.`;
}

export function ticketQtyForProduct(
  items: { id: string; productId: number; quantity: number }[],
  productId: number,
  exceptItemId?: string,
): number {
  return items.reduce((sum, item) => {
    if (item.productId !== productId) return sum;
    if (exceptItemId && item.id === exceptItemId) return sum;
    return sum + item.quantity;
  }, 0);
}

export function remainingStock(storeStock: number, alreadyCommitted: number): number {
  return Math.round((storeStock - alreadyCommitted) * 1000) / 1000;
}

export function formatStockAmount(value: number, unit?: string): string {
  const kind = unit ? quantityKind(unit) : "other";
  const amount = formatQuantityDisplay(value, kind);
  const suffix = unit?.trim() ? ` ${displayUnit(unit)}` : "";
  return `${amount}${suffix}`;
}

export function stockLimitMessage(input: {
  remaining: number;
  storeStock?: number;
  productName?: string;
  unit?: string;
  otherStoreNames?: string[];
}): string {
  const name = input.productName?.trim() ? ` pentru „${input.productName.trim()}”` : "";
  const elsewhere = otherStockHint(input.otherStoreNames ?? []);
  if ((input.storeStock ?? input.remaining) <= 0) {
    return `Nu există stoc la acest magazin${name}.${elsewhere}`;
  }
  if (input.remaining <= 0) {
    return `Stocul de la acest magazin${name} este deja pe biletele deschise.${elsewhere}`;
  }
  return `Stoc insuficient la acest magazin${name}. Mai poți adăuga cel mult ${formatStockAmount(input.remaining, input.unit)}.${elsewhere}`;
}
