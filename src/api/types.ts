export type FloorTicketStatus = "OPEN" | "READY" | "COMPLETED" | "CANCELLED";

export type Store = {
  id: string;
  name: string;
  city: string;
};

export type Department = {
  id: string;
  storeId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export type PublicStaff = {
  id: string;
  name: string;
};

export type SessionStaff = {
  id: string;
  name: string;
  storeId: string;
  departmentId: string;
  departmentName: string;
};

export type FloorTicketItem = {
  id: string;
  ticketId: string;
  productId: number;
  sku: string;
  nameSnapshot: string;
  quantity: number;
  addedByStaffId: string;
  addedByStaffName: string;
  addedAtDepartmentId: string;
  addedAtDepartmentName: string;
  clientItemId: string;
  createdAt: string;
  updatedAt: string;
};

export type FloorTicket = {
  id: string;
  storeId: string;
  number: number;
  displayNumber: string;
  customerName: string | null;
  status: FloorTicketStatus;
  createdByStaffId: string;
  createdByStaffName: string;
  createdAtDepartmentId: string;
  createdAtDepartmentName: string;
  createdAt: string;
  updatedAt: string;
  items: FloorTicketItem[];
  lastSeq: number;
};

export type FloorTicketSummary = Omit<FloorTicket, "items">;

export type FloorTicketEvent = {
  eventId: string;
  ticketId: string;
  storeId: string;
  seq: number;
  type: string;
  payload: unknown;
  at: string;
};

export type ProductLookup = {
  productId: number;
  sku: string;
  name: string;
  unit: string;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  staff: SessionStaff;
};

export type DeviceConfig = {
  storeId: string;
  storeName: string;
  departmentId: string;
  departmentName: string;
};
