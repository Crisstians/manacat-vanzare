import { deleteJson, getJson, getPublicJson, patchJson, postJson, postPublicJson } from "./client";
import type {
  AuthSession,
  Department,
  FloorTicket,
  FloorTicketEvent,
  FloorTicketStatus,
  FloorTicketSummary,
  ProductLookup,
  PublicStaff,
  StockInboundReport,
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
  return postPublicJson<AuthSession>("/floor/auth/login", input);
}

export async function refreshSession(refreshToken: string): Promise<AuthSession> {
  return postPublicJson<AuthSession>("/floor/auth/refresh", { refreshToken });
}

export async function logout(refreshToken: string): Promise<void> {
  await postPublicJson("/floor/auth/logout", { refreshToken });
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

export async function createScanLink(code: string, productId: number): Promise<ProductLookup> {
  return postJson<ProductLookup>("/floor/products/scan-links", { code, productId });
}

export async function listStockInbound(): Promise<StockInboundReport> {
  return getJson<StockInboundReport>("/floor/catalog/stock-inbound");
}
