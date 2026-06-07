import type {
  Allocation,
  AllocationWriteResult,
  AuditEntry,
  DashboardSummary,
  Me,
  Person,
  Project,
  ProjectStatus,
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

  listPeople: (includeInactive = false) =>
    request<Person[]>(`/people${includeInactive ? "?includeInactive=true" : ""}`),
  createPerson: (body: Omit<Person, "personId" | "isActive">) =>
    request<Person>("/people", { method: "POST", body: JSON.stringify(body) }),
  updatePerson: (id: string, body: Omit<Person, "personId">) =>
    request<Person>(`/people/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deactivatePerson: (id: string) => request<Person>(`/people/${id}/deactivate`, { method: "POST" }),

  listProjects: (pickerOnly = false) =>
    request<Project[]>(`/projects${pickerOnly ? "?picker=true" : ""}`),
  createProject: (body: Omit<Project, "projectId">) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify(body) }),
  updateProject: (id: string, body: Omit<Project, "projectId">) =>
    request<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  archiveProject: (id: string) => request<Project>(`/projects/${id}/archive`, { method: "POST" }),

  listAllocations: (weekStart: string, weeks: number, personId?: string) =>
    request<Allocation[]>(
      `/allocations?weekStart=${weekStart}&weeks=${weeks}${personId ? `&personId=${personId}` : ""}`,
    ),
  upsertAllocation: (body: { personId: string; projectId: string; weekStart: string; percentAllocated: number }) =>
    request<AllocationWriteResult>("/allocations", { method: "POST", body: JSON.stringify(body) }),
  deleteAllocation: (id: string) => request<AllocationWriteResult>(`/allocations/${id}`, { method: "DELETE" }),

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
