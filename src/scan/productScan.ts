import * as floorApi from "../api/floorApi";
import type { ScannedBarcodeProduct } from "../components/BarcodeScannerModal";

export function lookupCodeCandidates(raw: string): string[] {
  const code = raw.trim();
  if (!code) return [];
  if (/^0\d{12}$/.test(code)) return [code, code.slice(1)];
  return [code];
}

export async function resolveScannedProduct(raw: string): Promise<ScannedBarcodeProduct> {
  const candidates = lookupCodeCandidates(raw.trim());
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const looked = await floorApi.lookupProduct(candidate);
      const name = looked.name.trim() || looked.sku.trim() || candidate;
      return {
        code: candidate,
        name,
        unit: looked.unit,
        scanCodes: looked.scanCodes ?? [],
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Produsul nu a fost găsit");
}

export async function linkUnknownScannedCode(
  code: string,
  productId: number,
): Promise<ScannedBarcodeProduct> {
  const looked = await floorApi.createScanLink(code, productId);
  const name = looked.name.trim() || looked.sku.trim() || code;
  return {
    code,
    name,
    unit: looked.unit,
    scanCodes: looked.scanCodes ?? [code],
    linkedCode: looked.linkedCode ?? code,
  };
}
