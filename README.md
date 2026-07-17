# Capacity Tracker

An open-source **capacity-management and engagement-financial-planning
platform for professional-services companies**. It answers the two questions
every services firm runs on — *who is available, and is the work profitable?* —
in one system:

- **Capacity**: weekly, hours-based staffing and utilization for every person —
  who is booked, who is on the bench, who is overallocated — with forecasting,
  holiday-aware capacity, and staffing recommendations.
- **Engagement financials**: the full pre-sale-to-delivery lifecycle — pricing
  plans and rate cards, pipeline booking weighted by win probability,
  Closed/Won conversion with an immutable Original Plan baseline, monthly
  revenue phasing, delivery tracking with ETC/EAC, invoicing with variance and
  ERP (e.g. SAP) reconciliation, and firm-level rollups against finance
  targets.

It runs entirely on managed Azure PaaS, uses **Entra ID single sign-on** (no
custom auth code), and stores **no long-lived secrets**: every
service-to-service connection uses managed identity.

- **Author:** Drew Danner
- **License:** MIT

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Data model](#data-model)
- [Roles & authorization](#roles--authorization)
- [API surface](#api-surface)
- [Real-time updates](#real-time-updates)
- [Local development](#local-development)
- [Configuration reference](#configuration-reference)
- [Database: migrations & seed](#database-migrations--seed)
- [Infrastructure (Bicep)](#infrastructure-bicep)
- [CI/CD](#cicd)
- [Deployment](#deployment)
- [Security](#security)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Features

### Capacity & utilization (the core)
- **Utilization Tracker**: hours-based weekly grid (committed / pipeline /
  available rows per person) with RYG color coding, team totals, a heatmap
  view, sticky headers, and holiday-aware weekly capacity (US federal holidays
  reduce the week's capacity).
- **Resource Summary**: per-person forecast vs. target with RYG status,
  sortable columns, team totals, and a win-probability-weighted forecast
  toggle.
- **Dashboard**: availability-first stat cards (fully / partially available,
  overcommitted), every card and chart bar drills into a "how this is derived"
  view.
- **Bench & staffing**: filterable bench report (practice, weeks, min free
  hours, roll-off dates) with one-click deep links into staffing; a
  **Recommendations** engine ranks candidates for a described need (weeks ×
  hrs/week × required skills) with one-click staffing.
- **Placeholder roles** for demand planning and "Staff this role" conversion;
  overallocation warnings on save.
- **People**: profile pages (rank, practice, skills tags, certifications,
  industry experience, staffing preferences), inline editing, account→person
  auto-linking on first sign-in, and leadership person-merge.
- **Practices & ranks**: practices are first-class (create / rename / archive /
  merge, practice detail pages with weekly utilization rollups and rank mix);
  standard ranks are admin-configurable and drive dropdowns and target
  autofill.

### Engagement lifecycle & economics
- **Pricing plans**: role-based or fixed-fee plans with weekly hour grids,
  effective-dated **rate cards**, deal economics validation, pricing-issue and
  staffing-conflict badges, and **pipeline auto-booking** of the plan's hours
  into the tracker.
- **Closed/Won conversion**: authorized win conversion locks an immutable
  **Original Plan** baseline (variance tracked against it); Closed/Lost
  releases pipeline bookings and becomes read-only. Post-win staffing changes
  require a reason.
- **Revenue**: monthly revenue phasing tied to TCV, revenue setup confirmation,
  and **Task Order** document upload with heuristic term extraction and
  review-and-confirm.
- **Delivery**: delivery tracking, WIP CSV ingestion, change orders, expenses,
  **ETC/EAC** with manual override, and a firm-wide **Delivery Health**
  dashboard.
- **Invoicing**: invoices generated from effective-dated rates (or the
  confirmed fixed-fee schedule), capture of actual invoiced amounts with
  variance, an all-periods variance report, and CSV export.
- **Rollups**: firm/practice rollups reconciled to phasing and invoices, with
  finance targets and job codes.

### Platform
- **Audit log**: every mutation is recorded (who/what/when, old → new value);
  leadership-only view.
- **Modern UX**: command palette (Ctrl/Cmd-K), inline editing everywhere
  admins can edit, dark mode, responsive dialogs, CSV exports, filterable
  lists, company logo/favicon branding.
- **Real-time**: changes broadcast over Azure SignalR so open views refresh.
- **Role-based access**: `viewer` / `editor` / `leadership`, mapped from Entra
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

   Application Insights / Log Analytics  ◄── telemetry
```

Static Web Apps serves the SPA and proxies `/api/*` to the linked Functions
app. Authentication is handled by the SWA built-in Entra ID provider; after
sign-in, SWA calls the `rolesSource` endpoint (`/api/GetRoles`) to translate
Entra security-group membership into application roles. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the detailed design.

## Tech stack

| Layer | Technology | Version |
| ----- | ---------- | ------- |
| Frontend | React + TypeScript + Vite | React 19, TypeScript 6, Vite 8 |
| UI | shadcn/ui (Radix primitives + Tailwind v4) | Tailwind 4 |
| Data fetching | TanStack Query | 5 |
| Real-time client | `@microsoft/signalr` | 10 |
| Backend | Azure Functions, .NET isolated worker | v4 / .NET 8 |
| ORM | Entity Framework Core (code-first) | 8 |
| Database | Azure SQL Database (serverless) | n/a |
| Real-time service | Azure SignalR Service (Serverless mode) | n/a |
| Hosting / Auth | Azure Static Web Apps (Standard) | n/a |
| Observability | Application Insights + Log Analytics | n/a |
| IaC | Bicep | n/a |
| CI/CD | GitHub Actions | n/a |

## Repository layout

```
.
├── api/                     Azure Functions backend (.NET 8 isolated)
│   ├── Auth/                Client-principal parsing, roles, 401/403 authorizer
│   ├── Data/                EF Core DbContext + design-time factory
│   ├── Dtos/                Request/response records
│   ├── Functions/           HTTP triggers grouped by domain (people, projects,
│   │                        allocations, clients, practices, ranks, pricing
│   │                        plans, rate card, revenue, delivery, invoicing,
│   │                        rollups, task orders, dashboard, audit, me,
│   │                        GetRoles, SignalR)
│   ├── Migrations/          EF Core migrations (source of truth for schema)
│   ├── Models/              Entities (people, projects, plans, revenue, …)
│   ├── Realtime/            SignalR hub + group naming
│   ├── Services/            Plan economics, revenue phasing, ETC/EAC,
│   │                        invoicing/variance, task-order extraction, audit
│   └── CapacityTracker.Api.Tests/   xUnit tests for the services
├── web/                     React + Vite frontend
│   ├── public/staticwebapp.config.json   SWA routes, roles, 401/403, auth
│   └── src/
│       ├── components/      Layout, dialogs, InlineEdit, CommandPalette, ui/*
│       ├── hooks/           useRealtime (SignalR subscription)
│       ├── lib/             api client, types, holidays, staffing conflicts,
│       │                    practice utilization, ranks, theme (dark mode)
│       └── pages/           ~25 pages: Dashboard, Utilization Tracker,
│                            Resource Summary, People, Bench, Recommendations,
│                            Clients, Projects (+ delivery/invoicing), Pricing
│                            Plans, Rate Card, Revenue, Rollups, Delivery
│                            Health, Practices, Executive Summary, Audit, …
├── db/                      Deploy-time SQL (see migrations note below)
├── infra/                   Bicep IaC (main.bicep + modules/, per-env params)
├── docs/ARCHITECTURE.md     Design, data model, real-time, security
├── .agents/skills/          Devin testing skill for this repo
└── .github/workflows/       ci.yml, deploy-dev.yml, deploy-prod.yml, deploy.yml
```

## Data model

Core entities (EF Core code-first; see `api/Models/`):

| Area | Entities |
| ---- | -------- |
| People & staffing | `Person` (rank, practice, weekly capacity, rates, skills, certifications), `Allocation` (person × project × week **hours**, committed or pipeline), `Practice`, `StandardRank`, skill tags |
| Clients & projects | `Client` (industry, relationship partner), `Project` (status ∈ active / pipeline / closed, win %, deal value, engagement type, job code), `EngagementDocument` + `TaskOrderExtraction` |
| Pricing & revenue | `PricingPlan` / `PlanLineItem` / `PlanWeekHours`, `RateCard` (effective-dated), Original Plan baseline, `RevenuePhase` (monthly), finance targets |
| Delivery & billing | Delivery/WIP records, change orders, expenses, ETC override, `InvoiceRecord` |
| Platform | `AuditLog` (append-only history of every write) |

**Weekly grain:** one allocation row per person/project/week with **hours**
(not percentages). `WeekStart` is always normalized server-side to the Monday
(UTC) of the week. Weekly capacity defaults to 40h and is reduced by 8h per US
federal holiday in the week.

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
| `viewer` | Read-only across the app |
| `editor` | Full CRUD on people, projects, allocations, plans, and lifecycle data |
| `leadership` | Everything + audit log, person merge, practice merge, finance targets, win-conversion authorization |

The API enforces a single 401/403 contract (`api/Auth/RequestAuthorizer.cs`):
unauthenticated → **401** (the SPA redirects to `/.auth/login/aad`); authenticated
but missing the required role → **403**.

**Access for a new user** requires two things: a B2B guest invitation into the
tenant (for non-tenant users) **and** membership in one of the three role
security groups. On first sign-in, `/api/me` auto-links the account to an
existing `Person` record with the same email (re-keying to the Entra OID).

## API surface

All routes are served under `/api` and require authentication (`/api/audit*`
is leadership-only at the SWA layer too). Endpoints are grouped by domain in
`api/Functions/` — people, allocations, projects, clients, practices, ranks,
pricing plans (incl. line hours, economics, conversion), rate card, revenue
phasing/setup, delivery (WIP, change orders, expenses, ETC), delivery health,
invoicing (+ variance report), rollups (+ targets, job codes), task-order
documents/extraction, dashboard, audit, `me`, `GetRoles`, and SignalR
negotiate/groups. Mutating endpoints require `editor` (some `leadership`) and
write an `AuditLog` row.

## Real-time updates

- Hub: `capacity` · Event: `allocationChanged` · Group: `week:<ISO Monday>`.
- On every allocation upsert/delete, the API emits a SignalR message to the
  affected week's group.
- The client (`web/src/hooks/useRealtime.ts`) builds the connection with
  `withUrl("/api")`, joins the groups for the weeks on screen, re-joins on
  automatic reconnect, and invalidates the matching TanStack Query caches when
  an event arrives.

## Local development

**Prerequisites:** .NET 8 SDK, Azure Functions Core Tools v4, Node 22, and
either Docker (local SQL Server) or an `az login` session (dev Azure SQL).

```bash
# 1. Storage emulator (Functions runtime needs it)
npx azurite --silent --location /tmp/azurite &

# 2. Backend: configure and run the Functions host
cd api
cp local.settings.sample.json local.settings.json   # dev auth + conn strings
dotnet ef database update                            # local SQL only; the dev
                                                     # Azure DB is already migrated
func start                                           # http://localhost:7071

# 3. Frontend (new terminal)
cd web
npm install
npm run dev                                          # http://localhost:5173
```

The Vite dev server proxies `/api` → `http://localhost:7071`, so open
`http://localhost:5173`. You can point `SqlConnectionString` at either a local
SQL Server container or a deployed Azure SQL DB
(`sql-cap-<env>-<hash>.database.windows.net`, database `capacity`,
`Authentication=Active Directory Default` from your `az` session).

**Local auth** is mocked via `ALLOW_DEV_AUTH=true`: the API trusts these request
headers (falling back to `DEV_DEFAULT_ROLES`). This **must be `false`** in every
deployed environment.

| Header | Default | Meaning |
| ------ | ------- | ------- |
| `x-dev-oid` | `…0001` | Entra object ID to impersonate |
| `x-dev-roles` | `editor,leadership` | Comma-separated roles |
| `x-dev-email` | `dev.user@example.com` | Display name / email |

## Configuration reference

Function App settings (`local.settings.json` locally, app settings in Azure):

| Setting | Example / value | Notes |
| ------- | --------------- | ----- |
| `FUNCTIONS_WORKER_RUNTIME` | `dotnet-isolated` | n/a |
| `SqlConnectionString` | `Server=…;Authentication=Active Directory Managed Identity;…` | No secret; MI auth in Azure |
| `AzureWebJobsStorage__accountName` | `st…` | Identity-based storage (Azure) |
| `AzureSignalRConnectionString__serviceUri` | `https://…service.signalr.net` | Identity-based SignalR (Azure) |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | `InstrumentationKey=…` | Telemetry |
| `ENTRA_APP_ID` | app registration client ID | User-facing app (client) ID for SSO |
| `GROUP_VIEWER` / `GROUP_EDITOR` / `GROUP_LEADERSHIP` | group object IDs | Role mapping |
| `ALLOW_DEV_AUTH` | `false` (deployed) / `true` (local) | Enables header auth |
| `DEV_DEFAULT_ROLES` | `editor,leadership` | Local only |

## Database: migrations & seed

- **EF Core migrations** in `api/Migrations/` are the source of truth for the
  schema. Apply with `dotnet ef database update`; add one with
  `dotnet ef migrations add <Name>` after model changes.
- Deployed Azure SQL databases are kept migrated as part of each deploy;
  running migrations requires an identity with DDL rights (the SQL Entra
  admin), not the Function App's data-plane identity.
- `db/seed/seed.sql` provides idempotent demo data for local development and
  demos.

## Infrastructure (Bicep)

`infra/main.bicep` is **subscription-scoped**: it creates the resource group
(`rg-capacity-<env>`) and orchestrates one module per resource type. Resource
names follow `<type>-cap-<env>-<hash>`.

| Module | Resource(s) |
| ------ | ----------- |
| `logging.bicep` | Log Analytics workspace + Application Insights |
| `storage.bicep` | Storage account (Functions runtime + documents) |
| `keyvault.bicep` | Key Vault (RBAC, purge protection) |
| `sql.bicep` | SQL logical server + serverless DB (Entra-only auth, auto-pause 60 min) |
| `signalr.bicep` | SignalR Service (Serverless mode, Standard_S1) |
| `functions.bicep` | Consumption plan + Function App (system-assigned MI) |
| `rbac.bicep` | Role assignments: Function MI → Storage + SignalR |
| `staticwebapp.bicep` | Static Web App (Standard) + linked Functions backend |
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
| `ci.yml` | PRs to `main` | Build + test API, lint + build web, validate Bicep, Semgrep |
| `deploy-dev.yml` | push to `main` | Calls `deploy.yml` with dev params |
| `deploy-prod.yml` | manual (`workflow_dispatch`) | Calls `deploy.yml` with prod params |
| `deploy.yml` | reusable | Azure login → Bicep infra → SQL migrate → publish Functions → deploy SWA |

Branching model: **`main` is the default branch and deploys to dev on every
merge**; prod deploys are manual until the prod environment is stood up.

Manual dev redeploy (if ever needed):

```bash
# API
cd api && dotnet publish -c Release -o /tmp/apipub && (cd /tmp/apipub && zip -qr /tmp/api.zip .)
az functionapp deployment source config-zip -n func-cap-<env>-<hash> -g rg-capacity-<env> --src /tmp/api.zip
# Web
cd web && npm run build && npx @azure/static-web-apps-cli deploy ./dist \
  --deployment-token $(az staticwebapp secrets list -n swa-cap-<env>-<hash> -g rg-capacity-<env> -o tsv --query properties.apiKey) \
  --env production
```

## Deployment

Each environment is a resource group (`rg-capacity-<env>`) containing a Static
Web App, Function App, SQL server + `capacity` database, SignalR, storage,
Key Vault, and logging (resource names `<type>-cap-<env>-<hash>`).

### One-time setup for a new environment

1. Deploy the Bicep (`az deployment sub create` with the env's `.bicepparam`).
2. **Grant the Function App identity database access** (run once as the SQL
   Entra admin):
   ```sql
   CREATE USER [func-cap-<env>-xxxxxx] FROM EXTERNAL PROVIDER;
   ALTER ROLE db_datareader ADD MEMBER [func-cap-<env>-xxxxxx];
   ALTER ROLE db_datawriter ADD MEMBER [func-cap-<env>-xxxxxx];
   ```
3. **Register the SWA redirect URI** on the user-facing app registration
   (`ENTRA_APP_ID`): `https://<swa-hostname>/.auth/login/aad/callback`, and set
   `ENTRA_APP_CLIENT_SECRET` on the Static Web App for the built-in auth.
4. Fill the three role-group object IDs into the env's `.bicepparam`.
5. **Onboard users**: invite external users as B2B guests and add them to the
   viewer/editor/leadership security groups.

Prod additionally sets `deployPrivateEndpoints = true` with your
organization's VNet subnet and private DNS zone IDs.

## Security

- **No anonymous access**: every route requires an authenticated principal.
- **Roles** come from Entra groups via `GetRoles`; they are never trusted from
  the client.
- **Managed identity**: the Function App authenticates to SQL (Entra-only),
  SignalR, and Storage with its system-assigned identity. No connection-string
  secrets in code or config.
- **Append-only audit**: no updates/deletes; stores the actor's Entra OID.
- **Networking (prod)**: SQL, SignalR, Key Vault, and Storage are reachable only
  through private endpoints in your organization's VNet.
- **Transport**: HTTPS-only, TLS 1.2 minimum; security response headers set in
  `staticwebapp.config.json`.

## Testing

- `ci.yml` gates every PR: `dotnet build` + xUnit tests + `dotnet format`
  (API), `npm run lint` / typecheck / `npm run build` (web), Bicep validation,
  and Semgrep.
- Service-layer unit tests live in `api/CapacityTracker.Api.Tests/` (plan
  economics, revenue phasing, ETC, invoicing/variance, holidays, task-order
  extraction).
- End-to-end runtime testing is done against a local stack (Vite + Functions +
  dev Azure SQL) with dev-auth headers; the repeatable procedure lives in
  `.agents/skills/testing-capacity-tracker/SKILL.md`.

## Troubleshooting

| Symptom | Likely cause / fix |
| ------- | ------------------ |
| `/api/*` returns 401 locally | `ALLOW_DEV_AUTH` not `true`, or missing `x-dev-*` headers |
| First request after idle is very slow | Azure SQL serverless auto-pause (60 min); the DB resumes on demand |
| Live dev site behind merged code | Confirm the "Deploy Dev" workflow ran on the `main` push; redeploy manually if needed (see [CI/CD](#cicd)) |
| `dotnet ef` not found | `dotnet tool install --global dotnet-ef` |
| Real-time not updating | Confirm SignalR service (Azure) or skip locally; the client negotiates at `/api/negotiate` |
| SWA build can't find config | `staticwebapp.config.json` must ship in `web/public` so it lands at the site root |
| User signs in but has no access | They must be in one of the three role security groups (and a B2B guest if external) |
