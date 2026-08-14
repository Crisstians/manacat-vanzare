import { deleteJson, getJson, getPublicJson, patchJson, postJson } from "./client";
import type {
  AuthSession,
  Department,
  FloorTicket,
  FloorTicketEvent,
  FloorTicketStatus,
  FloorTicketSummary,
  ProductLookup,
  PublicStaff,
  Store,
} from "./types";

export async function listActiveStores(): Promise<Store[]> {
  return getPublicJson<Store[]>("/stores/active");
}

export async function listDepartments(storeId: string): Promise<Department[]> {
  return getPublicJson<Department[]>(
    `/floor/setup/departments?storeId=${encodeURIComponent(storeId)}`,
  );
}

export async function bootstrap(storeId: string, departmentId: string) {
  return getPublicJson<{ department: Department | null; staff: PublicStaff[] }>(
    `/floor/bootstrap?storeId=${encodeURIComponent(storeId)}&departmentId=${encodeURIComponent(departmentId)}`,
  );
}

export async function login(input: {
  storeId: string;
  departmentId: string;
  staffId: string;
  pin: string;
}): Promise<AuthSession> {
  return getPublicJsonCall("/floor/auth/login", input);
}

async function getPublicJsonCall<T>(path: string, body: unknown): Promise<T> {
  const { apiUrl } = await import("../config");
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as { data?: T; error?: string };
  if (!response.ok) {
    throw new Error(json.error ?? "Cererea a eșuat.");
  }
  return json.data as T;
}

export async function refreshSession(refreshToken: string): Promise<AuthSession> {
  return getPublicJsonCall("/floor/auth/refresh", { refreshToken });
}

export async function logout(refreshToken: string): Promise<void> {
  await getPublicJsonCall("/floor/auth/logout", { refreshToken });
}

export async function listTickets(): Promise<FloorTicketSummary[]> {
  return getJson<FloorTicketSummary[]>("/floor/tickets");
}

export async function createTicket(customerName?: string): Promise<FloorTicket> {
  return postJson<FloorTicket>("/floor/tickets", { customerName: customerName || null });
}

export async function getTicket(id: string): Promise<FloorTicket> {
  return getJson<FloorTicket>(`/floor/tickets/${id}`);
}

export async function updateTicket(id: string, customerName: string | null): Promise<FloorTicket> {
  return patchJson<FloorTicket>(`/floor/tickets/${id}`, { customerName });
}

export async function addItem(
  ticketId: string,
  input: { clientItemId: string; code: string; quantity: number },
): Promise<FloorTicket> {
  return postJson<FloorTicket>(`/floor/tickets/${ticketId}/items`, input);
}

export async function updateItem(
  ticketId: string,
  itemId: string,
  quantity: number,
): Promise<FloorTicket> {
  return patchJson<FloorTicket>(`/floor/tickets/${ticketId}/items/${itemId}`, { quantity });
}

export async function removeItem(ticketId: string, itemId: string): Promise<FloorTicket> {
  return deleteJson<FloorTicket>(`/floor/tickets/${ticketId}/items/${itemId}`);
}

export async function changeStatus(ticketId: string, status: FloorTicketStatus): Promise<FloorTicket> {
  return postJson<FloorTicket>(`/floor/tickets/${ticketId}/status`, { status });
}

export async function listEvents(ticketId: string, afterSeq: number): Promise<FloorTicketEvent[]> {
  return getJson<FloorTicketEvent[]>(`/floor/tickets/${ticketId}/events?afterSeq=${afterSeq}`);
}

export async function lookupProduct(code: string): Promise<ProductLookup> {
  return getJson<ProductLookup>(`/floor/products/lookup?code=${encodeURIComponent(code)}`);
}
