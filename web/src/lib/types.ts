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
  isActive: boolean;
}

export type ProjectStatus = "active" | "pipeline" | "closed";

export interface Project {
  projectId: string;
  clientName: string;
  projectName: string;
  startDate: string;
  endDate: string | null;
  status: ProjectStatus;
}

export interface Allocation {
  allocationId: string;
  personId: string;
  projectId: string;
  weekStart: string;
  percentAllocated: number;
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
  byWeek: { weekStart: string; allocatedPercent: number; utilizationRate: number }[];
  byProject: { projectId: string; projectName: string; allocatedPercent: number }[];
  peopleCount: number;
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
