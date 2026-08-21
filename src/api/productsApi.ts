import { getJson } from "./client";

export type CatalogProduct = {
  productId: number;
  sku: string;
  name: string;
  nameAlt: string;
  brand: string;
  unit: string;
  price: number;
  image: string;
  images: string[];
  stockByStore?: { storeId: string; storeName?: string; quantity: number; price?: number; priceExVat?: number }[];
};

export type ListProductsResponse = {
  items: CatalogProduct[];
  total: number;
  page: number;
  limit: number;
  version: number;
};

type SearchProductsOptions = {
  limit?: number;
  signal?: AbortSignal;
};

export async function searchProducts(
  q: string,
  options: SearchProductsOptions = {},
): Promise<ListProductsResponse> {
  const params = new URLSearchParams({
    q: q.trim(),
    page: "1",
    limit: String(options.limit ?? 20),
  });

  return getJson<ListProductsResponse>(`/floor/products?${params.toString()}`, {
    signal: options.signal,
  });
}
