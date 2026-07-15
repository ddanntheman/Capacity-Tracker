export type AppRole = "viewer" | "editor" | "leadership";

export interface Me {
  oid: string;
  displayName: string;
  email: string;
  roles: AppRole[];
}

export interface Person {
  personId: string;
  displayName: string;
  email: string;
  jobTitle: string | null;
  managerId: string | null;
  rank: string | null;
  practice: string | null;
  location: string | null;
  phone: string | null;
  startDate: string | null;
  /** Only present for leadership users. */
  costRate: number | null;
  /** Only present for leadership users. */
  billRate: number | null;
  utilizationTarget: number | null;
  weeklyCapacityHours: number;
  skills: string | null;
  certifications: string | null;
  industryExperience: string | null;
  staffingPreferences: string | null;
  notes: string | null;
  isActive: boolean;
  isPlaceholder: boolean;
}

export type ProjectStatus = "active" | "pipeline" | "closed";

export interface Project {
  projectId: string;
  clientName: string;
  projectName: string;
  startDate: string;
  endDate: string | null;
  status: ProjectStatus;
  /** Only present for leadership users. */
  dealValue: number | null;
  winProbability: number | null;
  engagementType: string | null;
  deliveryLeadId: string | null;
  notes: string | null;
  baselineLockedAtUtc: string | null;
}

export interface ProjectBaseline {
  lockedAtUtc: string;
  lockedBy: string | null;
  lines: {
    personId: string;
    personName: string;
    isPlaceholder: boolean;
    weekStart: string;
    hours: number;
  }[];
}

export interface Client {
  clientId: string;
  name: string;
  industry: string | null;
  relationshipPartner: string | null;
  notes: string | null;
}

export interface ClientDetail {
  client: Client;
  projects: Project[];
}

export interface Practice {
  practiceId: string;
  name: string;
  leadId: string | null;
  defaultUtilizationTarget: number | null;
  isArchived: boolean;
  headcount: number;
}

export interface ActualHours {
  actualHoursId: string;
  personId: string;
  month: string;
  chargeableHours: number;
}

export interface Allocation {
  allocationId: string;
  personId: string;
  projectId: string;
  weekStart: string;
  hours: number;
}

export interface RangeAllocationWriteResult {
  allocations: Allocation[];
  warning: string | null;
}

export interface AllocationWriteResult {
  allocation: Allocation;
  action: "created" | "updated" | "removed";
  weekTotal: number | null;
  warning: string | null;
}

export interface DashboardSummary {
  weekStart: string;
  peopleCount: number;
  availableHours: number;
  allocatedHours: number;
  utilizationRate: number;
  fullyAllocated: number;
  overAllocated: number;
  underutilized: number;
}

export interface UtilizationResponse {
  byWeek: { weekStart: string; allocatedHours: number; utilizationRate: number }[];
  byProject: { projectId: string; projectName: string; allocatedHours: number }[];
  peopleCount: number;
}

export interface RateCardEntry {
  rateCardEntryId: string;
  rank: string;
  geography: string;
  effectiveFrom: string;
  costRate: number;
  billRate: number;
}

export type PlanStatus = "draft" | "activePursuit" | "closedWon" | "closedLost";
export type PricingModel = "BlendedRate" | "RoleBased" | "FixedFee" | "Milestone" | "Outcome";
export type LineOrganization = "internal" | "subcontractor";

export interface PlanWeekHours {
  weekStart: string;
  hours: number;
}

export interface PlanLineItem {
  planLineItemId: string;
  roleTitle: string;
  rank: string | null;
  geography: string | null;
  organization: LineOrganization;
  subcontractorFirm: string | null;
  personId: string | null;
  personName: string | null;
  costRateOverride: number | null;
  billRateOverride: number | null;
  clientRate: number | null;
  sortOrder: number;
  weekHours: PlanWeekHours[];
}

export interface PricingPlanSummary {
  pricingPlanId: string;
  projectId: string;
  clientName: string;
  projectName: string;
  mdOwnerId: string | null;
  mdOwnerName: string | null;
  practice: string | null;
  status: PlanStatus;
  startDate: string;
  endDate: string;
  pricingModel: PricingModel;
  lineItemCount: number;
  totalHours: number;
  updatedAtUtc: string;
}

export interface PricingPlan {
  pricingPlanId: string;
  projectId: string;
  clientName: string;
  projectName: string;
  mdOwnerId: string | null;
  practice: string | null;
  status: PlanStatus;
  startDate: string;
  endDate: string;
  pricingModel: PricingModel;
  blendedRate: number | null;
  fixedFee: number | null;
  technologyFees: number;
  recoverableExpenses: number;
  notes: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  lineItems: PlanLineItem[];
}

export interface PlanLineEconomics {
  planLineItemId: string;
  roleTitle: string;
  personName: string | null;
  organization: LineOrganization;
  totalHours: number;
  costRate: number | null;
  clientRate: number | null;
  fees: number;
  cost: number;
  margin: number;
}

export interface PlanWeekEconomics {
  weekStart: string;
  hours: number;
  cumulativeHours: number;
  fees: number;
  cost: number;
  margin: number;
}

export interface PlanEconomics {
  totalHours: number;
  laborFees: number;
  technologyFees: number;
  tcv: number;
  jobRph: number | null;
  internalCost: number;
  subcontractorCost: number;
  grossProfit: number;
  jobMarginPct: number | null;
  grossFeesAtStandard: number;
  recoverableExpenses: number;
  netFees: number;
  feeAdjustment: number;
  recoveryPct: number | null;
  billableHours: number;
  internalRph: number | null;
  internalMarginPct: number | null;
  lines: PlanLineEconomics[];
  weeks: PlanWeekEconomics[];
  validationErrors: string[];
}

export interface AuditEntry {
  auditLogId: number;
  entityType: string;
  entityId: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedAt: string;
}
