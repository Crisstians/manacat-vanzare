import { apiUrl } from "../config";

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

type ApiErrorBody = { error?: string; code?: string };

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error ?? "Cererea a eșuat.";
  } catch {
    return "Cererea a eșuat.";
  }
}

export async function searchProducts(
  q: string,
  options: SearchProductsOptions = {},
): Promise<ListProductsResponse> {
  const params = new URLSearchParams({
    q: q.trim(),
    page: "1",
    limit: String(options.limit ?? 20),
  });

  const response = await fetch(apiUrl(`/products?${params.toString()}`), {
    method: "GET",
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as ListProductsResponse;
}
