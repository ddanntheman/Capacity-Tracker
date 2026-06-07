# Capacity Tracker

A consulting capacity-planning application: track **people**, **projects**, and
weekly **allocations**, with leadership dashboards, an append-only audit log, and
real-time updates. Built to run entirely on managed Azure PaaS with Entra ID
single sign-on and no long-lived secrets.

| Layer | Technology |
| ----- | ---------- |
| Frontend | React 18 + TypeScript + Vite, shadcn/ui (Radix + Tailwind v4), TanStack Query |
| Backend | Azure Functions v4, .NET 8 isolated worker, EF Core 8 |
| Database | Azure SQL Database (Entra-only auth, managed identity) |
| Real-time | Azure SignalR Service (Serverless) via Functions output binding |
| Hosting / Auth | Azure Static Web Apps (built-in Entra ID SSO, linked Functions backend) |
| Observability | Application Insights + Log Analytics (OpenTelemetry) |
| IaC | Bicep (modular, per resource type) |
| CI/CD | GitHub Actions with OIDC federated credentials |

## Repository layout

```
.
├── api/      Azure Functions backend (.NET 8 isolated, EF Core, SignalR)
├── web/      React + Vite frontend (shadcn/ui), incl. staticwebapp.config.json
├── db/       SQL migrations (idempotent) and demo seed data
├── infra/    Bicep templates (main.bicep + modules/) and per-env .bicepparam
├── docs/     Architecture and design notes
└── .github/  CI and deployment workflows
```

## Roles & authorization

Application roles are mapped from **Entra security groups** by Static Web Apps
via the `rolesSource` endpoint (`/api/GetRoles`). The group→role mapping is set
through app settings (`GROUP_VIEWER`, `GROUP_EDITOR`, `GROUP_LEADERSHIP`) so the
group object IDs can change per environment without code changes.

| Role | Capabilities |
| ---- | ------------ |
| `viewer` | Read dashboards and their own allocations |
| `editor` | Full CRUD on people, projects, and allocations |
| `leadership` | Dashboards + the audit log (read-only on data) |

Unauthenticated requests get `401` (the SPA redirects to `/.auth/login/aad`);
authenticated-but-unauthorized requests get `403`.

## Local development

Prerequisites: .NET 8 SDK, Azure Functions Core Tools v4, Node 22, Docker.

```bash
# 1. SQL Server (local)
docker run -e 'ACCEPT_EULA=Y' -e 'MSSQL_SA_PASSWORD=Your_password123' \
  -p 1433:1433 -d --name capacity-sql mcr.microsoft.com/mssql/server:2022-latest

# 2. Backend: apply migrations + seed, then run the Functions host
cd api
cp local.settings.sample.json local.settings.json   # dev auth + local conn strings
dotnet ef database update
sqlcmd -S localhost,1433 -U sa -P 'Your_password123' -d capacity -i ../db/seed/seed.sql
func start            # http://localhost:7071

# 3. Frontend
cd ../web
npm install
npm run dev           # http://localhost:5173 (proxies /api -> :7071)
```

Local auth is mocked through `ALLOW_DEV_AUTH=true`: the API trusts the
`x-dev-oid`, `x-dev-roles`, and `x-dev-email` headers (defaulting to
`DEV_DEFAULT_ROLES`). This **must** be `false` in every deployed environment.

Optional real-time locally: run the Azure SignalR emulator and Azurite, and set
`AzureSignalRConnectionString` to the emulator endpoint.

## Deployment

Deployments are fully automated through GitHub Actions using **OIDC federated
credentials** — there are no stored cloud secrets. `develop` deploys the `dev`
environment; `main` deploys `prod`.

### One-time setup

1. **Deployment app registration** (done by Andersen IT / platform team): create
   an app registration, grant it `Contributor` + `User Access Administrator` on
   the target subscription, and add a federated credential:
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

3. **Bicep parameters**: fill in `infra/main.<env>.bicepparam`:
   - `sqlAdminLogin` / `sqlAdminObjectId` — the Entra user or group that owns SQL
   - `groupViewer` / `groupEditor` / `groupLeadership` — security group object IDs
   - For prod: `privateEndpointSubnetId` and the private DNS zone IDs from the
     VNet supplied by Andersen IT (`deployPrivateEndpoints = true`)

### Post-deploy steps

- **Grant the Function App identity database access** (one-time, run as the SQL
  Entra admin):
  ```sql
  CREATE USER [func-cap-prod-xxxxxx] FROM EXTERNAL PROVIDER;
  ALTER ROLE db_datareader ADD MEMBER [func-cap-prod-xxxxxx];
  ALTER ROLE db_datawriter ADD MEMBER [func-cap-prod-xxxxxx];
  ```
- **Register the SWA redirect URI** on the user-facing app registration
  (`b1faa118-3bb5-4c21-8903-cbaf6c1d81ff`):
  `https://<swa-hostname>/.auth/login/aad/callback`
- Set `ENTRA_APP_CLIENT_SECRET` on the Static Web App (used by built-in auth).

The OIDC subject is the only value that changes after transferring the repo to
the `Andersen-Consulting` org — update the federated credential subjects above.

## CI

`ci.yml` runs on every PR to `main`/`develop`: builds the .NET API, lints and
builds the web app, and validates the Bicep templates.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the data model, real-time
design, and security details.
