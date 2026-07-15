import type {
  ActualHours,
  Allocation,
  AllocationWriteResult,
  AuditEntry,
  Client,
  ClientDetail,
  DashboardSummary,
  Me,
  Person,
  Practice,
  Project,
  ProjectBaseline,
  ProjectStatus,
  RangeAllocationWriteResult,
  UtilizationResponse,
} from "./types";

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API error ${status}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  me: () => request<Me>("/me"),

  listPeople: (includeInactive = false, includePlaceholders = false) => {
    const qs = new URLSearchParams();
    if (includeInactive) qs.set("includeInactive", "true");
    if (includePlaceholders) qs.set("includePlaceholders", "true");
    const s = qs.toString();
    return request<Person[]>(`/people${s ? `?${s}` : ""}`);
  },
  getPerson: (id: string) => request<Person>(`/people/${id}`),
  createPerson: (body: Omit<Person, "personId" | "isActive" | "isPlaceholder"> & { isPlaceholder?: boolean }) =>
    request<Person>("/people", { method: "POST", body: JSON.stringify(body) }),
  updatePerson: (id: string, body: Omit<Person, "personId" | "isPlaceholder">) =>
    request<Person>(`/people/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deactivatePerson: (id: string) => request<Person>(`/people/${id}/deactivate`, { method: "POST" }),
  mergePerson: (id: string, targetPersonId: string) =>
    request<Person>(`/people/${id}/merge`, { method: "POST", body: JSON.stringify({ targetPersonId }) }),

  listProjects: (pickerOnly = false) =>
    request<Project[]>(`/projects${pickerOnly ? "?picker=true" : ""}`),
  createProject: (body: Omit<Project, "projectId" | "baselineLockedAtUtc">) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify(body) }),
  updateProject: (id: string, body: Omit<Project, "projectId" | "baselineLockedAtUtc">) =>
    request<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  getProjectBaseline: (id: string) =>
    request<ProjectBaseline | null>(`/projects/${id}/baseline`),
  archiveProject: (id: string) => request<Project>(`/projects/${id}/archive`, { method: "POST" }),
  mergeProject: (id: string, targetProjectId: string) =>
    request<Project>(`/projects/${id}/merge`, { method: "POST", body: JSON.stringify({ targetProjectId }) }),
  splitProject: (id: string, newNames: string[]) =>
    request<Project[]>(`/projects/${id}/split`, { method: "POST", body: JSON.stringify({ newNames }) }),

  listClients: () => request<Client[]>("/clients"),
  getClient: (id: string) => request<ClientDetail>(`/clients/${id}`),
  updateClient: (id: string, body: Omit<Client, "clientId">) =>
    request<Client>(`/clients/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  createClient: (body: Omit<Client, "clientId">) =>
    request<Client>("/clients", { method: "POST", body: JSON.stringify(body) }),
  deleteClient: (id: string) => request<void>(`/clients/${id}`, { method: "DELETE" }),
  mergeClient: (id: string, targetClientId: string) =>
    request<Client>(`/clients/${id}/merge`, { method: "POST", body: JSON.stringify({ targetClientId }) }),

  listPractices: () => request<Practice[]>("/practices"),
  createPractice: (body: { name: string; leadId: string | null; defaultUtilizationTarget: number | null }) =>
    request<Practice>("/practices", { method: "POST", body: JSON.stringify(body) }),
  updatePractice: (
    id: string,
    body: { name: string; leadId: string | null; defaultUtilizationTarget: number | null; isArchived?: boolean },
  ) => request<Practice>(`/practices/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  mergePractice: (id: string, targetPracticeId: string) =>
    request<Practice>(`/practices/${id}/merge`, { method: "POST", body: JSON.stringify({ targetPracticeId }) }),

  listActuals: (year: number) => request<ActualHours[]>(`/actuals?year=${year}`),
  upsertActual: (body: { personId: string; month: string; chargeableHours: number }) =>
    request<ActualHours | undefined>("/actuals", { method: "POST", body: JSON.stringify(body) }),

  listAllocations: (weekStart: string, weeks: number, personId?: string) =>
    request<Allocation[]>(
      `/allocations?weekStart=${weekStart}&weeks=${weeks}${personId ? `&personId=${personId}` : ""}`,
    ),
  upsertAllocation: (body: { personId: string; projectId: string; weekStart: string; hours: number }) =>
    request<AllocationWriteResult>("/allocations", { method: "POST", body: JSON.stringify(body) }),
  deleteAllocation: (id: string) => request<AllocationWriteResult>(`/allocations/${id}`, { method: "DELETE" }),
  rangeUpsertAllocations: (body: {
    personId: string;
    projectId: string;
    weekStart: string;
    weeks: number;
    hoursPerWeek: number;
  }) => request<RangeAllocationWriteResult>("/allocations/range", { method: "POST", body: JSON.stringify(body) }),

  dashboardSummary: (weekStart?: string) =>
    request<DashboardSummary>(`/dashboard/summary${weekStart ? `?weekStart=${weekStart}` : ""}`),
  dashboardUtilization: (weekStart: string, weeks: number) =>
    request<UtilizationResponse>(`/dashboard/utilization?weekStart=${weekStart}&weeks=${weeks}`),

  auditLog: (params: { from?: string; to?: string; entityType?: string; entityId?: string; take?: number }) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.entityType) qs.set("entityType", params.entityType);
    if (params.entityId) qs.set("entityId", params.entityId);
    qs.set("take", String(params.take ?? 200));
    return request<AuditEntry[]>(`/audit?${qs.toString()}`);
  },
};

export type { ProjectStatus };
