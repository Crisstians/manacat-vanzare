export type QuantityKind = "piece" | "area" | "other";

function compactUnit(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function quantityKind(unit: string): QuantityKind {
  const compact = compactUnit(unit);
  if (
    compact === "mp" ||
    compact === "m2" ||
    compact === "mq" ||
    compact === "sqm" ||
    compact.includes("metrupatrat")
  ) {
    return "area";
  }
  if (
    compact === "buc" ||
    compact === "bucata" ||
    compact === "bucati" ||
    compact === "pcs" ||
    compact === "pc" ||
    compact === "piece" ||
    compact === "pieces"
  ) {
    return "piece";
  }
  return "other";
}

export function displayUnit(unit: string): string {
  const kind = quantityKind(unit);
  if (kind === "area") return "m²";
  if (kind === "piece") return "buc";
  return unit.trim();
}

export function sanitizeQuantityInput(raw: string, kind: QuantityKind): string {
  if (kind === "piece") {
    return raw.replace(/[^\d]/g, "");
  }
  let separatorSeen = false;
  let result = "";
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") {
      result += ch;
      continue;
    }
    if ((ch === "." || ch === ",") && !separatorSeen) {
      separatorSeen = true;
      result += ch;
    }
  }
  if (kind !== "area") return result;
  const sepIndex = result.search(/[.,]/);
  if (sepIndex < 0) return result;
  return result.slice(0, sepIndex + 1) + result.slice(sepIndex + 1).slice(0, 2);
}

export function formatQuantityDisplay(value: number, kind: QuantityKind): string {
  if (!Number.isFinite(value)) return "—";
  if (kind === "area") return value.toFixed(2).replace(".", ",");
  if (kind === "piece" || Number.isInteger(value)) {
    return String(kind === "piece" ? Math.round(value) : value);
  }
  return value.toFixed(3).replace(/\.?0+$/, "").replace(".", ",");
}

export function parseQuantity(
  raw: string,
  kind: QuantityKind,
): { ok: true; value: number } | { ok: false; message: string } {
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, message: "Cantitate invalidă" };
  }
  if (kind === "piece" && !Number.isInteger(value)) {
    return { ok: false, message: "Pentru bucăți, cantitatea trebuie să fie un număr întreg" };
  }
  if (kind === "area") {
    const rounded = Math.round(value * 100) / 100;
    if (rounded <= 0) {
      return { ok: false, message: "Cantitate invalidă" };
    }
    return { ok: true, value: rounded };
  }
  return { ok: true, value };
}

export function inferUnitFromResults(
  items: { productId: number; sku: string; unit: string }[],
  query: string,
): string | null {
  if (items.length === 0) return null;
  const q = query.trim().toLowerCase();
  const exact = items.find(
    (item) => String(item.productId) === q || item.sku.trim().toLowerCase() === q,
  );
  if (exact?.unit) return exact.unit;
  const kinds = new Set(items.map((item) => quantityKind(item.unit)));
  if (kinds.size === 1) return items[0]?.unit ?? null;
  return null;
}
