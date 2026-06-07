# Capacity Tracker

A consulting **capacity-planning** application for tracking people, projects, and
weekly allocations, with leadership dashboards, an append-only audit log, and
real-time updates. It runs entirely on managed Azure PaaS, uses **Entra ID single
sign-on** (no custom auth code), and stores **no long-lived secrets** — every
service-to-service connection uses managed identity, and every deployment uses
GitHub OIDC federated credentials.

- **Author / owner:** Drew Danner (`drew.danner@bdemerson.com`)
- **Status:** Initial build, verified locally end-to-end. Not yet deployed to
  Azure (pending Andersen IT prerequisites — see [Deployment](#deployment)).

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Data model](#data-model)
- [Roles & authorization](#roles--authorization)
- [API reference](#api-reference)
- [Real-time updates](#real-time-updates)
- [Local development](#local-development)
- [Configuration reference](#configuration-reference)
- [Database: migrations & seed](#database-migrations--seed)
- [Infrastructure (Bicep)](#infrastructure-bicep)
- [CI/CD](#cicd)
- [Deployment](#deployment)
- [Security](#security)
- [Accessibility](#accessibility)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Weekly allocation grid** — rows = people, columns = weeks; each cell stacks a
  person's projects for that week and is colour-coded by total utilization
  (green < 80 %, amber 80–100 %, red > 100 %). Click a cell to edit per-project
  percentages inline.
- **Validation** — a person's allocations for a week may not exceed 100 %; the UI
  and API both warn at ≥ 80 % and reject > 100 %.
- **People & Projects management** — full CRUD for editors; people are
  auto-provisioned from Entra on first sign-in.
- **Leadership dashboards** — capacity summary, utilization trend, per-project
  rollups, and per-person drill-down.
- **Audit log** — append-only history of every write (who/what/when), visible to
  leadership.
- **Real-time** — allocation changes broadcast over Azure SignalR to everyone
  viewing the affected week.
- **Role-based access** — `viewer` / `editor` / `leadership`, mapped from Entra
  security groups.

## Architecture

```
Browser ──► Azure Static Web Apps  (Entra ID SSO, serves the React SPA)
                 │  linked backend: /api/*
                 ▼
        Azure Functions (.NET 8 isolated)
          │              │
          │              └──► Azure SignalR Service (Serverless) ──► clients
          ▼
     Azure SQL Database  (Entra-only auth via managed identity)

   Application Insights / Log Analytics  ◄── OpenTelemetry traces & logs
```

Static Web Apps serves the SPA and proxies `/api/*` to the linked Functions app.
Authentication is handled by the SWA built-in Entra ID provider; after sign-in,
SWA calls the `rolesSource` endpoint (`/api/GetRoles`) to translate Entra
security-group membership into application roles. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the detailed design.

## Tech stack

| Layer | Technology | Version |
| ----- | ---------- | ------- |
| Frontend | React + TypeScript + Vite | React 18.3, Vite 6 |
| UI | shadcn/ui (Radix primitives + Tailwind v4) | Tailwind 4 |
| Data fetching | TanStack Query | 5 |
| Real-time client | `@microsoft/signalr` | 8 |
| Backend | Azure Functions, .NET isolated worker | v4 / .NET 8 |
| ORM | Entity Framework Core (code-first) | 8 |
| Database | Azure SQL Database (serverless) | — |
| Real-time service | Azure SignalR Service (Serverless mode) | — |
| Hosting / Auth | Azure Static Web Apps (Standard) | — |
| Observability | Application Insights + Log Analytics | — |
| IaC | Bicep | — |
| CI/CD | GitHub Actions (OIDC) | — |

## Repository layout

```
.
├── api/                     Azure Functions backend (.NET 8 isolated)
│   ├── Auth/                Client-principal parsing, roles, 401/403 authorizer
│   ├── Data/                EF Core DbContext + design-time factory
│   ├── Dtos/                Request/response records
│   ├── Functions/           HTTP triggers (people, projects, allocations,
│   │                        dashboard, audit, me, GetRoles, SignalR)
│   ├── Migrations/          EF Core migrations (local dev: dotnet ef)
│   ├── Models/              Entities: Person, Project, Allocation, AuditLog
│   ├── Realtime/            SignalR hub + group naming
│   ├── Services/            AuditService, WeekHelper
│   ├── Program.cs           Host + DI wiring
│   └── local.settings.sample.json   Copy to local.settings.json for dev
├── web/                     React + Vite frontend
│   ├── public/staticwebapp.config.json   SWA routes, roles, 401/403, auth
│   └── src/
│       ├── components/      Layout, RequireRole, LoginScreen, ui/* (shadcn)
│       ├── hooks/           useRealtime (SignalR subscription)
│       ├── lib/             api client, types, realtime, week helpers
│       └── pages/           Dashboard, Allocations, People, Projects, Audit
├── db/
│   ├── migrations/0001_initial.sql   Idempotent deploy-time schema
│   └── seed/seed.sql                 Demo data
├── infra/                   Bicep IaC
│   ├── main.bicep           Subscription-scoped orchestration
│   ├── main.dev.bicepparam  Dev parameters
│   ├── main.prod.bicepparam Prod parameters
│   └── modules/             One module per resource type
├── docs/ARCHITECTURE.md     Design, data model, real-time, security
└── .github/workflows/       ci.yml, deploy-dev.yml, deploy-prod.yml, deploy.yml
```

> **Two kinds of migrations:** `api/Migrations/*` are EF Core code-first
> migrations used for local development (`dotnet ef database update`).
> `db/migrations/0001_initial.sql` is the idempotent SQL the deployment pipeline
> applies to Azure SQL (the Functions managed identity has only data-plane
> rights, not schema rights). Keep them in sync when the model changes.

## Data model

| Entity | Key fields | Notes |
| ------ | ---------- | ----- |
| `Person` | `PersonId` (Entra OID, PK), `DisplayName`, `Email`, `JobTitle`, `ManagerId`, `IsActive` | Auto-provisioned on first `/api/me` |
| `Project` | `ProjectId` (PK), `ClientName`, `ProjectName`, `StartDate`, `EndDate`, `Status` | `Status` ∈ {`active`, `pipeline`, `closed`} |
| `Allocation` | `AllocationId` (PK), `PersonId`, `ProjectId`, `WeekStart` (Monday, UTC), `PercentAllocated` (0–100) | Unique on (`PersonId`, `ProjectId`, `WeekStart`) |
| `AuditLog` | `AuditLogId` (PK), `EntityType`, `EntityId`, `FieldChanged`, `OldValue`, `NewValue`, `ChangedBy` (OID), `ChangedAt` (UTC) | Append-only; indexed by `ChangedAt` and (`EntityType`, `EntityId`) |

**Weekly grain:** one allocation row per person/project/week. `WeekStart` is
always normalized server-side to the Monday (UTC) of the week, so a non-Monday
date submitted via a direct API call still maps to the correct week.

## Roles & authorization

Application roles are derived from **Entra security groups** by Static Web Apps
via the `rolesSource` endpoint (`POST /api/GetRoles`). The group→role mapping is
supplied through app settings so group object IDs are configuration, not code:

| App setting | Maps membership to role |
| ----------- | ----------------------- |
| `GROUP_LEADERSHIP` | `leadership` |
| `GROUP_EDITOR` | `editor` |
| `GROUP_VIEWER` | `viewer` |

| Role | Capabilities |
| ---- | ------------ |
| `viewer` | Read dashboards and their **own** allocations |
| `editor` | Full CRUD on people, projects, and allocations |
| `leadership` | Dashboards + the audit log (read-only on data) |

The API enforces a single 401/403 contract (`api/Auth/RequestAuthorizer.cs`):
unauthenticated → **401** (the SPA redirects to `/.auth/login/aad`); authenticated
but missing the required role → **403**.

## API reference

All routes are served under `/api`. Unless noted, all require authentication.

| Method | Route | Roles | Purpose |
| ------ | ----- | ----- | ------- |
| GET | `/api/me` | any | Current user; auto-provisions a `Person` |
| POST | `/api/GetRoles` | (SWA only) | `rolesSource` — groups → roles |
| GET | `/api/people` | viewer+ | List people (`?includeInactive=true`) |
| GET | `/api/people/{id}` | viewer+ | Get a person |
| POST | `/api/people` | editor | Create a person |
| PUT | `/api/people/{id}` | editor | Update a person |
| POST | `/api/people/{id}/deactivate` | editor | Soft-deactivate |
| GET | `/api/projects` | viewer+ | List projects (`?picker=true` hides closed) |
| POST | `/api/projects` | editor | Create a project |
| PUT | `/api/projects/{id}` | editor | Update a project |
| POST | `/api/projects/{id}/archive` | editor | Archive (close) a project |
| GET | `/api/allocations` | viewer+ | Allocations for a week window (`?weekStart=&weeks=&personId=`); viewers see only their own |
| POST | `/api/allocations` | editor | Upsert an allocation (0 % removes it) |
| DELETE | `/api/allocations/{id}` | editor | Remove an allocation |
| GET | `/api/dashboard/summary` | viewer+ | Capacity summary for a week |
| GET | `/api/dashboard/utilization` | viewer+ | Utilization trend |
| GET | `/api/dashboard/person/{id}` | viewer+ | Per-person drill-down |
| GET | `/api/audit` | leadership | Audit log (date/entity filters) |
| POST | `/api/negotiate` | viewer+ | SignalR connection negotiation |
| POST | `/api/groups/join` · `/api/groups/leave` | viewer+ | Join/leave week groups |

## Real-time updates

- Hub: `capacity` · Event: `allocationChanged` · Group: `week:<ISO Monday>`.
- On every allocation upsert/delete, the API emits a SignalR message to the
  affected week's group.
- The client (`web/src/hooks/useRealtime.ts`) builds the connection with
  `withUrl("/api")` (the SignalR client appends `/negotiate`), joins the groups
  for the weeks on screen, **re-joins on automatic reconnect**, and invalidates
  the matching TanStack Query caches when an event arrives.

## Local development

**Prerequisites:** .NET 8 SDK, Azure Functions Core Tools v4, Node 22, Docker.

```bash
# 1. SQL Server (local)
docker run -e 'ACCEPT_EULA=Y' -e 'MSSQL_SA_PASSWORD=Your_password123' \
  -p 1433:1433 -d --name capacity-sql mcr.microsoft.com/mssql/server:2022-latest

# 2. Backend: configure, apply migrations + seed, run the Functions host
cd api
cp local.settings.sample.json local.settings.json   # dev auth + local conn strings
dotnet tool install --global dotnet-ef               # once, if not installed
dotnet ef database update                            # create schema
sqlcmd -S localhost,1433 -U sa -P 'Your_password123' -d capacity -i ../db/seed/seed.sql
func start                                            # http://localhost:7071

# 3. Frontend (new terminal)
cd web
npm install
npm run dev                                           # http://localhost:5173
```

The Vite dev server proxies `/api` → `http://localhost:7071`, so open
`http://localhost:5173`.

**Local auth** is mocked via `ALLOW_DEV_AUTH=true`: the API trusts these request
headers (falling back to `DEV_DEFAULT_ROLES`). This **must be `false`** in every
deployed environment.

| Header | Default | Meaning |
| ------ | ------- | ------- |
| `x-dev-oid` | `…0001` | Entra object ID to impersonate |
| `x-dev-roles` | `editor,leadership` | Comma-separated roles |
| `x-dev-email` | `dev.user@bdemerson.com` | Display name / email |

**Optional real-time locally:** run [Azurite](https://github.com/Azure/Azurite)
and the [Azure SignalR emulator](https://learn.microsoft.com/azure/azure-signalr/signalr-howto-emulator),
then point `AzureSignalRConnectionString` at the emulator endpoint.

## Configuration reference

Function App settings (`local.settings.json` locally, app settings in Azure):

| Setting | Example / value | Notes |
| ------- | --------------- | ----- |
| `FUNCTIONS_WORKER_RUNTIME` | `dotnet-isolated` | — |
| `SqlConnectionString` | `Server=…;Authentication=Active Directory Managed Identity;…` | No secret; MI auth in Azure |
| `AzureWebJobsStorage__accountName` | `st…` | Identity-based storage (Azure) |
| `AzureSignalRConnectionString__serviceUri` | `https://…service.signalr.net` | Identity-based SignalR (Azure) |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | `InstrumentationKey=…` | Telemetry |
| `ENTRA_APP_ID` | `b1faa118-…` | User-facing app (client) ID for SSO |
| `GROUP_VIEWER` / `GROUP_EDITOR` / `GROUP_LEADERSHIP` | group object IDs | Role mapping |
| `ALLOW_DEV_AUTH` | `false` (prod) / `true` (local) | Enables header auth |
| `DEV_DEFAULT_ROLES` | `editor,leadership` | Local only |

## Database: migrations & seed

- **Local:** `dotnet ef database update` (EF code-first migrations in
  `api/Migrations`). Add a migration with
  `dotnet ef migrations add <Name>` after model changes.
- **Azure:** the deploy pipeline applies `db/migrations/0001_initial.sql`
  (idempotent) using an Entra access token, because the Function App's managed
  identity has only `db_datareader`/`db_datawriter`, not DDL rights.
- **Seed:** `db/seed/seed.sql` inserts demo people, projects, and allocations.

## Infrastructure (Bicep)

`infra/main.bicep` is **subscription-scoped**: it creates the resource group
(`rg-capacity-<env>`) and orchestrates one module per resource type.

| Module | Resource(s) |
| ------ | ----------- |
| `logging.bicep` | Log Analytics workspace + Application Insights |
| `storage.bicep` | Storage account (Functions runtime) |
| `keyvault.bicep` | Key Vault (RBAC, purge protection) |
| `sql.bicep` | SQL logical server + serverless DB (Entra-only auth) |
| `signalr.bicep` | SignalR Service (Serverless mode) |
| `functions.bicep` | Consumption plan + Function App (system-assigned MI) |
| `rbac.bicep` | Role assignments: Function MI → Storage + SignalR |
| `staticwebapp.bicep` | Static Web App + linked Functions backend |
| `privateEndpoints.bicep` | Private endpoints + DNS zone groups (prod) |

Per-environment parameters live in `main.dev.bicepparam` and
`main.prod.bicepparam`. Build/validate locally:

```bash
az bicep build --file infra/main.bicep
az bicep build-params --file infra/main.dev.bicepparam --outfile /tmp/dev.json
```

## CI/CD

| Workflow | Trigger | What it does |
| -------- | ------- | ------------ |
| `ci.yml` | PRs to `main`/`develop` | Build API, lint + build web, validate Bicep |
| `deploy-dev.yml` | push to `develop` | Calls `deploy.yml` with dev params |
| `deploy-prod.yml` | push to `main` | Calls `deploy.yml` with prod params |
| `deploy.yml` | reusable | OIDC login → Bicep infra → SQL migrate → publish Functions → deploy SWA |

Branching model: **`main` = prod, `develop` = dev**; a PR is required to merge to
either.

## Deployment

Deployments are fully automated via GitHub Actions using **OIDC federated
credentials** — there are no stored cloud secrets.

### One-time setup

1. **Deployment app registration** (Andersen IT / platform team): create an app
   registration, grant it `Contributor` + `User Access Administrator` on the
   subscription, and add federated credentials:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject (dev): `repo:Andersen-Consulting/capacity-tracker:ref:refs/heads/develop`
   - Subject (prod): `repo:Andersen-Consulting/capacity-tracker:ref:refs/heads/main`
   - Audience: `api://AzureADTokenExchange`

2. **GitHub repository configuration**

   Secrets:
   | Name | Value |
   | ---- | ----- |
   | `AZURE_CLIENT_ID` | Deployment app registration client ID |
   | `AZURE_TENANT_ID` | `396a5f5f-4bee-4dd0-aea6-809ef5dc4ac7` |
   | `AZURE_SUBSCRIPTION_ID` | `8c566e11-1347-4229-9108-55575f6f6eaa` |

   Variables:
   | Name | Value |
   | ---- | ----- |
   | `AZURE_REGION` | `eastus2` |

3. **Bicep parameters** — fill in `infra/main.<env>.bicepparam`:
   - `sqlAdminLogin` / `sqlAdminObjectId` — Entra user or group that owns SQL
   - `groupViewer` / `groupEditor` / `groupLeadership` — security group object IDs
   - Prod: `privateEndpointSubnetId` + private DNS zone IDs from the
     Andersen-supplied VNet (`deployPrivateEndpoints = true`)

### Post-deploy steps

- **Grant the Function App identity database access** (run once as the SQL Entra
  admin):
  ```sql
  CREATE USER [func-cap-prod-xxxxxx] FROM EXTERNAL PROVIDER;
  ALTER ROLE db_datareader ADD MEMBER [func-cap-prod-xxxxxx];
  ALTER ROLE db_datawriter ADD MEMBER [func-cap-prod-xxxxxx];
  ```
- **Register the SWA redirect URI** on the user-facing app registration
  (`b1faa118-3bb5-4c21-8903-cbaf6c1d81ff`):
  `https://<swa-hostname>/.auth/login/aad/callback`
- Set `ENTRA_APP_CLIENT_SECRET` on the Static Web App for the built-in auth.

> After transferring the repo to the `Andersen-Consulting` org, the **only**
> values that change are the OIDC federated-credential subjects above.

## Security

- **No anonymous access** — every route requires an authenticated principal.
- **Roles** come from Entra groups via `GetRoles`; they are never trusted from
  the client.
- **Managed identity** — the Function App authenticates to SQL (Entra-only),
  SignalR, and Storage with its system-assigned identity. No connection-string
  secrets in code or config.
- **Append-only audit** — no updates/deletes; stores only the actor's Entra OID,
  never PII.
- **Networking (prod)** — SQL, SignalR, Key Vault, and Storage are reachable only
  through private endpoints in the Andersen-supplied VNet.
- **Transport** — HTTPS-only, TLS 1.2 minimum; security response headers set in
  `staticwebapp.config.json`.

## Accessibility

The UI is built on shadcn/ui (Radix primitives), which provides keyboard
navigation, focus management, and ARIA semantics out of the box, targeting
**WCAG 2.1 AA**.

## Testing

- `dotnet build` (API) and `npm run lint` / `npm run build` (web) gate every PR
  via `ci.yml`; Bicep is compiled and parameter files validated.
- The full stack has been exercised locally end-to-end: sign-in (mocked roles),
  reading dashboards, editing allocations (persist + validation), audit logging,
  and 401/403 role gating.

## Troubleshooting

| Symptom | Likely cause / fix |
| ------- | ------------------ |
| `/api/*` returns 401 locally | `ALLOW_DEV_AUTH` not `true`, or missing `x-dev-*` headers |
| `dotnet ef` not found | `dotnet tool install --global dotnet-ef` |
| SQL connection refused locally | SQL container not running / wrong SA password |
| Real-time not updating | Confirm the SignalR emulator (local) or SignalR service (Azure) is reachable; the client negotiates at `/api/negotiate` |
| SWA build can't find config | `staticwebapp.config.json` must ship in `web/public` so it lands at the site root |
