// All fetch calls go to /api/... which Next.js rewrites to the backend API.

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("admin_token");
}

export function setToken(token: string): void {
  sessionStorage.setItem("admin_token", token);
}

export function clearToken(): void {
  sessionStorage.removeItem("admin_token");
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

export type Unit = {
  id: string;
  flatNo: string;
  type: string;
  carpetArea: number;
  towerId: string;
  societyId: string;
};

export type Resident = {
  id: string;
  name: string;
  mobile: string;
  isPrimary: boolean;
  canPay: boolean;
};

export type UnitResident = {
  id: string;
  residentId: string;
  relationship: string;
  isPrimary: boolean;
  canPay: boolean;
};

export type ParkingSpot = {
  id: string;
  spotNo: string;
  type: string;
  isRentable: boolean;
};

export type UnitDetail = {
  unit: Unit;
  residents: Resident[];
  unitResidents: UnitResident[];
  parkingSpots: ParkingSpot[];
};

export type ImportReport = {
  applied: boolean;
  totalRows: number;
  errors: Array<{ row: number; message: string }>;
  wouldCreateUnits: number;
  wouldCreateResidents: number;
  wouldCreateUnitResidents: number;
  wouldCreateParkingSpots: number;
};

export type AdminPrincipal = {
  id: string;
  name: string;
  email: string;
  role: string;
  societyId: string;
};

export type BillHead = {
  id: string;
  societyId: string;
  name: string;
  computeRule: string;
  rate: number;
  taxRule: object;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BillingCycle = {
  id: string;
  societyId: string;
  period: string;
  dueDate: string;
  status: string;
  lateFeeRule: object;
  createdAt: string;
  updatedAt: string;
};

export type Bill = {
  id: string;
  societyId: string;
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
  updatedAt: string;
};

export type BillLineItem = {
  id: string;
  billId: string;
  headId: string;
  description: string;
  qty: number;
  rate: number;
  amount: number;
  taxAmount: number;
};

export type CollectionSummary = {
  period: string;
  cycleId: string;
  status: string;
  totalBills: number;
  paid: number;
  partial: number;
  overdue: number;
  unpaid: number;
  totalDue: number;
  totalCollected: number;
};

export const api = {
  adminLoginRequest: (email: string) =>
    apiFetch<{ message: string }>("/auth/admin/login/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }),

  adminLoginVerify: (email: string, code: string) =>
    apiFetch<{ accessToken: string; admin: AdminPrincipal }>(
      "/auth/admin/login/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      },
    ),

  me: () => apiFetch<AdminPrincipal>("/me"),

  listUnits: () => apiFetch<Unit[]>("/admin/units"),

  getUnit: (id: string) => apiFetch<UnitDetail>(`/admin/units/${id}`),

  importPreview: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<ImportReport>("/admin/residents/import?dryRun=true", {
      method: "POST",
      body: form,
    });
  },

  importApply: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<ImportReport>("/admin/residents/import?dryRun=false", {
      method: "POST",
      body: form,
    });
  },

  downloadTemplate: () => fetch("/api/admin/residents/import/template"),

  // ── Billing ────────────────────────────────────────────────────────────────

  listBillHeads: () => apiFetch<BillHead[]>("/admin/billing/heads"),

  createBillHead: (input: { name: string; computeRule: string; rate: number; taxRule?: object }) =>
    apiFetch<BillHead>("/admin/billing/heads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  updateBillHead: (id: string, input: Partial<{ name: string; computeRule: string; rate: number; isActive: boolean }>) =>
    apiFetch<BillHead>(`/admin/billing/heads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  deleteBillHead: (id: string) =>
    fetch(`/api/admin/billing/heads/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    }),

  listBillingCycles: () => apiFetch<BillingCycle[]>("/admin/billing/cycles"),

  createBillingCycle: (input: { period: string; dueDate: string }) =>
    apiFetch<BillingCycle>("/admin/billing/cycles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  generateBills: (cycleId: string) =>
    apiFetch<{ billsGenerated: number }>(`/admin/billing/cycles/${cycleId}/generate`, { method: "POST" }),

  publishCycle: (cycleId: string) =>
    apiFetch<BillingCycle>(`/admin/billing/cycles/${cycleId}/publish`, { method: "POST" }),

  closeCycle: (cycleId: string) =>
    apiFetch<BillingCycle>(`/admin/billing/cycles/${cycleId}/close`, { method: "POST" }),

  getCycleSummary: (cycleId: string) =>
    apiFetch<CollectionSummary>(`/admin/billing/cycles/${cycleId}/summary`),

  listCycleBills: (cycleId: string) =>
    apiFetch<Bill[]>(`/admin/billing/cycles/${cycleId}/bills`),

  getBill: (billId: string) =>
    apiFetch<Bill & { lineItems: BillLineItem[]; unit: Unit | null }>(`/admin/billing/bills/${billId}`),

  // ── Payments ───────────────────────────────────────────────────────────────

  listPayments: () => apiFetch<Payment[]>("/admin/payments"),

  reconcilePayments: () =>
    apiFetch<{ reconciled: number; checked: number }>("/admin/payments/reconcile", { method: "POST" }),

  // ── Bank accounts ──────────────────────────────────────────────────────────

  listBankAccounts: () => apiFetch<BankAccount[]>("/admin/bank-accounts"),

  submitBankAccount: (input: { accountName: string; accountNumber: string; ifsc: string; bankName: string }) =>
    apiFetch<BankAccount>("/admin/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  approveBankAccount: (societyId: string, id: string) =>
    apiFetch<BankAccount>(`/admin/societies/${societyId}/bank-accounts/${id}/approve`, { method: "POST" }),

  rejectBankAccount: (societyId: string, id: string, reason: string) =>
    apiFetch<BankAccount>(`/admin/societies/${societyId}/bank-accounts/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }),

  // ── Audit log ──────────────────────────────────────────────────────────────

  listAuditLog: () => apiFetch<AuditLogEntry[]>("/admin/audit-log"),

  // ── Tickets ────────────────────────────────────────────────────────────────

  listTickets: (params?: { status?: string; category?: string; type?: string }) => {
    const qs = params ? `?${new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString()}` : "";
    return apiFetch<Ticket[]>(`/admin/tickets${qs}`);
  },

  getTicket: (id: string) => apiFetch<Ticket & { events: TicketEvent[] }>(`/admin/tickets/${id}`),

  assignTicket: (id: string, assignedTo: string, comment?: string) =>
    apiFetch<Ticket>(`/admin/tickets/${id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedTo, comment }),
    }),

  updateTicketStatus: (id: string, status: string, comment?: string) =>
    apiFetch<Ticket>(`/admin/tickets/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, comment }),
    }),

  commentTicket: (id: string, body: string) =>
    apiFetch<{ ok: boolean }>(`/admin/tickets/${id}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }),

  checkSla: () =>
    apiFetch<{ checked: number; breached: number }>("/admin/tickets/check-sla", { method: "POST" }),

  // ── Bookable Resources ─────────────────────────────────────────────────────

  listResources: () => apiFetch<BookableResource[]>("/admin/resources"),

  createResource: (input: { name: string; description?: string; capacity?: number }) =>
    apiFetch<BookableResource>("/admin/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  updateResource: (id: string, input: Partial<{ name: string; capacity: number; isActive: boolean }>) =>
    apiFetch<BookableResource>(`/admin/resources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  listBookings: (params?: { resourceId?: string; status?: string }) => {
    const qs = params ? `?${new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString()}` : "";
    return apiFetch<Booking[]>(`/admin/bookings${qs}`);
  },

  cancelBooking: (id: string) =>
    apiFetch<Booking>(`/admin/bookings/${id}/cancel`, { method: "POST" }),

  // ── Parking Allocations ────────────────────────────────────────────────────

  listParkingAllocations: () => apiFetch<ParkingAllocation[]>("/admin/parking-allocations"),

  createParkingAllocation: (input: { spotId: string; unitId: string; period: string; rentAmount: number; startsAt: string; cycleId?: string; dueDate?: string }) =>
    apiFetch<ParkingAllocation & { billId: string | null }>("/admin/parking-allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  endParkingAllocation: (id: string) =>
    apiFetch<ParkingAllocation>(`/admin/parking-allocations/${id}/end`, { method: "POST" }),
};

export type Payment = {
  id: string;
  residentId: string;
  provider: string;
  providerOrderId: string;
  providerPaymentId: string | null;
  amountPaise: number;
  amountRupees: number;
  currency: string;
  status: string;
  metadata: object;
  createdAt: string;
};

export type BankAccount = {
  id: string;
  societyId: string;
  accountName: string;
  accountNumberLast4: string;
  ifsc: string;
  bankName: string;
  status: string;
  razorpayLinkedAccountId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type Ticket = {
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

export type BookableResource = {
  id: string;
  societyId: string;
  name: string;
  description: string;
  capacity: number;
  slotRules: object;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Booking = {
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

export type ParkingAllocation = {
  id: string;
  societyId: string;
  spotId: string;
  unitId: string;
  period: string;
  rentAmount: number;
  billId: string | null;
  startsAt: string;
  endsAt: string | null;
  status: string;
  createdAt: string;
};

export type AuditLogEntry = {
  id: string;
  actorId: string | null;
  actorKind: string;
  action: string;
  entityType: string;
  entityId: string | null;
  beforeState: unknown;
  afterState: unknown;
  createdAt: string;
};
