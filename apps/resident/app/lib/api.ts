// All fetch calls go to /api/... which Next.js rewrites to the backend API.

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("resident_token");
}

export function setToken(token: string): void {
  sessionStorage.setItem("resident_token", token);
}

export function clearToken(): void {
  sessionStorage.removeItem("resident_token");
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type Notice = {
  id: string;
  title: string;
  body: string;
  audience: string;
  pinned: boolean;
  publishAt: string;
  expiresAt: string | null;
  createdAt: string;
};

export type ResidentPrincipal = {
  id: string;
  name: string;
  mobile: string;
  role: string;
  societyId: string;
};

export type Bill = {
  id: string;
  unitId: string;
  cycleId: string;
  dueDate: string;
  status: string;
  subtotal: number;
  taxTotal: number;
  arrearsCarryForward: number;
  totalDue: number;
  paidAmount: number;
  createdAt: string;
};

export type BillLineItem = {
  id: string;
  headId: string;
  description: string;
  qty: number;
  rate: number;
  amount: number;
  taxAmount: number;
};

export const api = {
  loginRequest: (mobile: string) =>
    apiFetch<{ message: string }>("/auth/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile }),
    }),

  loginVerify: (mobile: string, code: string) =>
    apiFetch<{ accessToken: string; resident: ResidentPrincipal }>(
      "/auth/otp/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, code }),
      },
    ),

  listNotices: () => apiFetch<Notice[]>("/resident/notices"),

  getNotice: (id: string) => apiFetch<Notice>(`/resident/notices/${id}`),

  listBills: () => apiFetch<Bill[]>("/resident/bills"),

  getBill: (id: string) => apiFetch<Bill & { lineItems: BillLineItem[] }>(`/resident/bills/${id}`),

  invoicePdfUrl: (id: string) => `/api/resident/bills/${id}/invoice.pdf`,

  createPaymentOrder: (billId: string) =>
    apiFetch<PaymentOrder>("/payments/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billId }),
    }),

  listPayments: () => apiFetch<Payment[]>("/resident/payments"),

  // ── Tickets ────────────────────────────────────────────────────────────────

  createTicket: (input: { type: string; category: string; description: string; priority?: string; unitId?: string }) =>
    apiFetch<ResidentTicket>("/resident/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  listTickets: () => apiFetch<ResidentTicket[]>("/resident/tickets"),

  getTicket: (id: string) => apiFetch<ResidentTicket & { events: TicketEvent[] }>(`/resident/tickets/${id}`),

  addTicketComment: (id: string, body: string) =>
    apiFetch<{ ok: boolean }>(`/resident/tickets/${id}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }),

  reopenTicket: (id: string) =>
    apiFetch<ResidentTicket>(`/resident/tickets/${id}/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),

  // ── Bookings ───────────────────────────────────────────────────────────────

  listResources: () => apiFetch<BookableResource[]>("/resident/resources"),

  createBooking: (input: { resourceId: string; unitId: string; slotStart: string; slotEnd: string }) =>
    apiFetch<ResidentBooking>("/resident/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  listBookings: () => apiFetch<ResidentBooking[]>("/resident/bookings"),

  cancelBooking: (id: string) =>
    apiFetch<ResidentBooking>(`/resident/bookings/${id}/cancel`, { method: "POST" }),
};

export type PaymentOrder = {
  id: string;
  orderId: string;
  providerOrderId: string;
  amountPaise: number;
  currency: string;
  billId: string;
};

export type ResidentTicket = {
  id: string;
  societyId: string;
  unitId: string | null;
  raisedBy: string;
  type: string;
  category: string;
  description: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  slaDueAt: string | null;
  slaBreached: boolean;
  channel: string;
  createdAt: string;
  updatedAt: string;
};

export type TicketEvent = {
  id: string;
  ticketId: string;
  actorId: string | null;
  actorKind: string;
  eventType: string;
  oldValue: string | null;
  newValue: string | null;
  body: string | null;
  createdAt: string;
};

export type Payment = {
  id: string;
  providerOrderId: string;
  providerPaymentId: string | null;
  amountPaise: number;
  amountRupees: number;
  currency: string;
  status: string;
  createdAt: string;
};

export type BookableResource = {
  id: string;
  societyId: string;
  name: string;
  description: string;
  capacity: number;
  isActive: boolean;
  createdAt: string;
};

export type ResidentBooking = {
  id: string;
  societyId: string;
  resourceId: string;
  unitId: string;
  bookedBy: string;
  slotStart: string;
  slotEnd: string;
  status: string;
  createdAt: string;
};
