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
