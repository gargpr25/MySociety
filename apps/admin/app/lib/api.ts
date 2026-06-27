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
};
