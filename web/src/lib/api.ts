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
  PlanEconomics,
  PricingPlan,
  PricingPlanSummary,
  Practice,
  Project,
  StandardRank,
  ProjectRevenueMonth,
  RateCardEntry,
  RevenuePhase,
  RevenueSetup,
  EngagementDocument,
  PlanPhasing,
  ProjectBaseline,
  ProjectDelivery,
  DeliveryHealthRow,
  ProjectStatus,
  ChangeOrder,
  RecoverableExpense,
  EtcOverrideInfo,
  WipUploadResult,
  InvoicePeriod,
  InvoiceVarianceReport,
  FirmRollup,
  FirmTarget,
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
  createProject: (body: Omit<Project, "projectId" | "baselineLockedAtUtc" | "jobCode"> & { jobCode?: string | null }) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify(body) }),
  updateProject: (id: string, body: Omit<Project, "projectId" | "baselineLockedAtUtc" | "jobCode"> & { jobCode?: string | null }) =>
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

  listRanks: () => request<StandardRank[]>("/ranks"),
  createRank: (body: { name: string; sortOrder?: number | null; defaultUtilizationTarget: number | null }) =>
    request<StandardRank>("/ranks", { method: "POST", body: JSON.stringify(body) }),
  updateRank: (
    id: string,
    body: { name: string; sortOrder?: number | null; defaultUtilizationTarget: number | null; isArchived?: boolean },
  ) => request<StandardRank>(`/ranks/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteRank: (id: string) => request<void>(`/ranks/${id}`, { method: "DELETE" }),

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

  listRateCard: () => request<RateCardEntry[]>("/ratecard"),
  createRateCardEntry: (body: Omit<RateCardEntry, "rateCardEntryId">) =>
    request<RateCardEntry>("/ratecard", { method: "POST", body: JSON.stringify(body) }),
  updateRateCardEntry: (id: string, body: Omit<RateCardEntry, "rateCardEntryId">) =>
    request<RateCardEntry>(`/ratecard/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteRateCardEntry: (id: string) => request<void>(`/ratecard/${id}`, { method: "DELETE" }),

  listPlans: () => request<PricingPlanSummary[]>("/plans"),
  getPlan: (id: string) => request<PricingPlan>(`/plans/${id}`),
  createPlan: (body: {
    projectId?: string | null;
    clientName?: string | null;
    projectName?: string | null;
    mdOwnerId?: string | null;
    practice?: string | null;
    startDate: string;
    endDate: string;
    pricingModel?: string | null;
  }) => request<PricingPlan>("/plans", { method: "POST", body: JSON.stringify(body) }),
  updatePlan: (
    id: string,
    body: {
      mdOwnerId: string | null;
      practice: string | null;
      status: string;
      startDate: string;
      endDate: string;
      pricingModel: string;
      blendedRate: number | null;
      fixedFee: number | null;
      technologyFees: number;
      recoverableExpenses: number;
      notes: string | null;
    },
  ) => request<PricingPlan>(`/plans/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deletePlan: (id: string) => request<void>(`/plans/${id}`, { method: "DELETE" }),
  createPlanLine: (planId: string, body: PlanLineWrite) =>
    request<PricingPlan>(`/plans/${planId}/lines`, { method: "POST", body: JSON.stringify(body) }),
  updatePlanLine: (planId: string, lineId: string, body: PlanLineWrite) =>
    request<PricingPlan>(`/plans/${planId}/lines/${lineId}`, { method: "PUT", body: JSON.stringify(body) }),
  deletePlanLine: (planId: string, lineId: string, reason?: string) =>
    request<PricingPlan>(
      `/plans/${planId}/lines/${lineId}${reason ? `?reason=${encodeURIComponent(reason)}` : ""}`,
      { method: "DELETE" },
    ),
  setPlanLineHours: (
    planId: string,
    lineId: string,
    weekHours: { weekStart: string; hours: number }[],
    reason?: string,
  ) =>
    request<PricingPlan>(`/plans/${planId}/lines/${lineId}/hours`, {
      method: "PUT",
      body: JSON.stringify({ weekHours, reason: reason ?? null }),
    }),
  planEconomics: (id: string) => request<PlanEconomics>(`/plans/${id}/economics`),

  getPlanPhasing: (id: string) => request<PlanPhasing>(`/plans/${id}/phasing`),
  savePlanPhasing: (id: string, phases: RevenuePhase[]) =>
    request<PlanPhasing>(`/plans/${id}/phasing`, { method: "PUT", body: JSON.stringify({ phases }) }),
  convertPlan: (id: string) =>
    request<{ converted: boolean; tcv: number; months: number }>(`/plans/${id}/convert`, {
      method: "POST",
      body: JSON.stringify({ confirmPricing: true }),
    }),

  listDocuments: (projectId: string) => request<EngagementDocument[]>(`/projects/${projectId}/documents`),
  uploadDocument: async (projectId: string, file: File, kind: string): Promise<EngagementDocument> => {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    const res = await fetch(`/api/projects/${projectId}/documents`, { method: "POST", body: form });
    if (!res.ok) {
      throw new ApiError(res.status, await res.json().catch(() => null));
    }
    return (await res.json()) as EngagementDocument;
  },
  deleteDocument: (projectId: string, docId: string) =>
    request<void>(`/projects/${projectId}/documents/${docId}`, { method: "DELETE" }),

  getRevenueSetup: (projectId: string) => request<RevenueSetup | null>(`/projects/${projectId}/revenue-setup`),
  proposeRevenueSetup: (projectId: string) =>
    request<RevenueSetup>(`/projects/${projectId}/revenue-setup/propose`, { method: "POST" }),
  updateRevenueSetup: (
    projectId: string,
    body: {
      feeStructure: string;
      tcv: number;
      contractRph: number | null;
      invoiceFrequency: string | null;
      invoiceScheduleNotes: string | null;
      confirm: boolean;
    },
  ) => request<RevenueSetup>(`/projects/${projectId}/revenue-setup`, { method: "PUT", body: JSON.stringify(body) }),
  projectRevenue: (projectId: string) => request<ProjectRevenueMonth[]>(`/projects/${projectId}/revenue`),

  getProjectDelivery: (projectId: string) => request<ProjectDelivery>(`/projects/${projectId}/delivery`),
  saveProjectActuals: (
    projectId: string,
    entries: { planLineItemId: string; weekStart: string; hours: number; hardCost?: number | null }[],
  ) =>
    request<ProjectDelivery>(`/projects/${projectId}/delivery/actuals`, {
      method: "PUT",
      body: JSON.stringify({ entries }),
    }),
  uploadWipReport: (projectId: string, csv: string) =>
    request<WipUploadResult>(`/projects/${projectId}/delivery/wip`, {
      method: "POST",
      body: JSON.stringify({ csv }),
    }),
  createChangeOrder: (
    projectId: string,
    body: { title: string; notes: string | null; deltaHours: number; deltaFees: number; engagementDocumentId?: string | null },
  ) => request<ChangeOrder>(`/projects/${projectId}/change-orders`, { method: "POST", body: JSON.stringify(body) }),
  approveChangeOrder: (projectId: string, orderId: string) =>
    request<ChangeOrder>(`/projects/${projectId}/change-orders/${orderId}/approve`, { method: "POST" }),
  deleteChangeOrder: (projectId: string, orderId: string) =>
    request<void>(`/projects/${projectId}/change-orders/${orderId}`, { method: "DELETE" }),
  createExpense: (
    projectId: string,
    body: { periodStart: string; vendor: string; amount: number; notes: string | null },
  ) => request<RecoverableExpense>(`/projects/${projectId}/expenses`, { method: "POST", body: JSON.stringify(body) }),
  deleteExpense: (projectId: string, expenseId: string) =>
    request<void>(`/projects/${projectId}/expenses/${expenseId}`, { method: "DELETE" }),
  setEtcOverride: (projectId: string, body: { hours: number; fees: number; justification: string }) =>
    request<EtcOverrideInfo>(`/projects/${projectId}/etc-override`, { method: "PUT", body: JSON.stringify(body) }),
  clearEtcOverride: (projectId: string) =>
    request<void>(`/projects/${projectId}/etc-override`, { method: "DELETE" }),

  getDeliveryHealth: () => request<DeliveryHealthRow[]>("/delivery/health"),

  getProjectInvoicing: (projectId: string, period?: string) =>
    request<InvoicePeriod>(`/projects/${projectId}/invoicing${period ? `?period=${period}` : ""}`),
  captureInvoice: (projectId: string, period: string, body: { invoicedAmount: number; invoiceDate: string | null; notes: string | null }) =>
    request<InvoicePeriod>(`/projects/${projectId}/invoicing/${period}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteInvoice: (projectId: string, period: string) =>
    request<InvoicePeriod>(`/projects/${projectId}/invoicing/${period}`, { method: "DELETE" }),
  getInvoiceVariance: (projectId: string) =>
    request<InvoiceVarianceReport>(`/projects/${projectId}/invoicing-variance`),

  getFirmRollup: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const suffix = qs.toString();
    return request<FirmRollup>(`/rollups${suffix ? `?${suffix}` : ""}`);
  },
  listFirmTargets: () => request<FirmTarget[]>("/rollups/targets"),
  upsertFirmTargets: (targets: { periodStart: string; revenueTarget: number; netFeesTarget: number }[]) =>
    request<FirmTarget[]>("/rollups/targets", { method: "PUT", body: JSON.stringify({ targets }) }),
  deleteFirmTarget: (period: string) =>
    request<FirmTarget[]>(`/rollups/targets/${period}`, { method: "DELETE" }),

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

export interface PlanLineWrite {
  roleTitle: string;
  rank: string | null;
  geography: string | null;
  organization: string;
  subcontractorFirm: string | null;
  personId: string | null;
  costRateOverride: number | null;
  billRateOverride: number | null;
  clientRate: number | null;
  sortOrder?: number | null;
  reason?: string | null;
}

export type { ProjectStatus };
