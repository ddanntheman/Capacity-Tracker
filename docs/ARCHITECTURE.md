# Architecture

## Overview

```
Browser ──► Azure Static Web Apps (Entra ID SSO, static React app)
                │  (linked backend, /api/*)
                ▼
        Azure Functions (.NET 8 isolated)
          │            │
          │            └──► Azure SignalR Service (Serverless) ──► clients
          ▼
     Azure SQL Database (Entra-only auth via managed identity)

   Application Insights / Log Analytics  ◄── OpenTelemetry traces & logs
```

Static Web Apps serves the SPA and proxies `/api/*` to the linked Azure
Functions app. Authentication is handled entirely by the Static Web Apps
built-in Entra ID provider; there is no custom auth code. After sign-in, SWA
calls the `rolesSource` endpoint (`/api/GetRoles`) to translate the user's Entra
security-group membership into application roles.

## Data model

| Entity | Key fields | Notes |
| ------ | ---------- | ----- |
| `Person` | `PersonId` (Entra OID, PK), `DisplayName`, `Email`, `JobTitle`, `ManagerId`, `IsActive` | Auto-provisioned on first sign-in (`/api/me`) |
| `Project` | `ProjectId` (PK), `ClientName`, `ProjectName`, `StartDate`, `EndDate`, `Status` | Status ∈ {active, pipeline, closed} |
| `Allocation` | `AllocationId` (PK), `PersonId`, `ProjectId`, `WeekStart` (Monday), `PercentAllocated` (0–100) | Unique on (`PersonId`, `ProjectId`, `WeekStart`) |
| `AuditLog` | `AuditLogId` (PK), `EntityType`, `EntityId`, `FieldChanged`, `OldValue`, `NewValue`, `ChangedBy` (OID), `ChangedAt` (UTC) | Append-only; indexed by `ChangedAt` and (`EntityType`, `EntityId`) |

Weekly grain: one allocation row per person/project/week. `WeekStart` is always
normalized to the Monday (UTC) of the week. Validation rejects a write that
pushes a person's weekly total above 100% and warns at ≥ 80%.

## Real-time updates

- Hub name: `capacity`
- Event: `allocationChanged`
- Group key: `week:<ISO Monday>` (e.g. `week:2026-06-01`)

On every allocation upsert/delete, the Functions handler emits a SignalR message
to the affected week's group. The client (`useRealtime`) negotiates via
`/api/negotiate`, joins the groups for the weeks currently on screen, and
invalidates the relevant TanStack Query caches when an event arrives.

## Security

- **No anonymous access**: all routes require an authenticated principal.
- **Roles** are derived from Entra security groups (`GetRoles`), never trusted
  from the client.
- **Managed identity**: the Function App's system-assigned identity authenticates
  to SQL (Entra-only), SignalR, and Storage; no connection-string secrets.
- **Audit log** is append-only (no updates or deletes) and stores only the Entra
  OID of the actor, never PII.
- **Networking (prod)**: SQL, SignalR, Key Vault, and Storage are reachable only
  through private endpoints in the Andersen-supplied VNet.

## Infrastructure modules

`infra/main.bicep` is subscription-scoped: it creates the resource group and
orchestrates one module per resource type.

| Module | Resource(s) |
| ------ | ----------- |
| `logging.bicep` | Log Analytics workspace + Application Insights |
| `storage.bicep` | Storage account (Functions runtime) |
| `keyvault.bicep` | Key Vault (RBAC, purge protection) |
| `sql.bicep` | SQL logical server + serverless database (Entra-only) |
| `signalr.bicep` | SignalR Service (Serverless mode) |
| `functions.bicep` | Consumption plan + Function App (system-assigned MI) |
| `rbac.bicep` | Role assignments: Function MI → Storage + SignalR |
| `staticwebapp.bicep` | Static Web App + linked Functions backend |
| `privateEndpoints.bicep` | Private endpoints + DNS zone groups (prod) |
