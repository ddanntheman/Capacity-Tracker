---
name: testing-capacity-tracker
description: Run and test the Capacity Tracker app (React/Vite web + Azure Functions API + Azure SQL) locally end-to-end. Use when verifying UI features, staffing/utilization workflows, or API changes.
---

# Testing Capacity Tracker end-to-end

## Local dev setup (preferred over live site)
The deployed Static Web App (https://salmon-desert-092eaec10.7.azurestaticapps.net) requires an interactive Entra ID login that can't be automated. Test locally instead:

1. Start Azurite (Functions needs a storage emulator): `azurite --silent --location /tmp/azurite &`
2. API: `cd api && func start` (port 7071). Point it at the dev Azure SQL DB via the connection string in local.settings.json (server `sql-cap-dev-tfoiku.database.windows.net`, DB `Capacity`). Azure auth comes from the `az` CLI session.
3. Web: `cd web && npm run dev` (port 5173). The Vite dev server proxies `/api` to :7071.
4. Auth is mocked in dev: set `ALLOW_DEV_AUTH=true` on the API; the web app sends dev headers for `dev.user@andersenconsulting.com` with editor+leadership roles. No login screen appears.

## Golden-path flows to exercise
- **Bench → staffing**: /bench filters (practice, weeks, min free) → /allocations, click a person×week cell, add hours + "apply to following weeks" → verify bench free hours drop.
- **Utilization**: /utilization (C/P/A rows, RYG cells), /resource-summary (RYG status badges), /actuals (enter value, reload, check Resource Summary "Actual to date").
- **Clients/deals**: /clients/:id detail; project edit (win %, engagement type, deal value) on /projects.
- **Dashboards**: /dashboard stat cards and chart bars open drill-down dialogs; /executive-summary firm total should equal the sum of practice rows (verify arithmetic); /revenue weighted pipeline = pipeline × win probability.
- To see revenue numbers, at least one staffed person needs a bill rate (most seeded people have none — the page shows a "no bill rate" notice by design). Set one via People → Edit.

## Gotchas
- Dashboard briefly renders zeros (0%, 0 people) while loading — wait for data before asserting.
- Client edit (PUT /api/clients/:id) may fail with a 500 ("SqlServerRetryingExecutionStrategy does not support user-initiated transactions") — a known EF Core bug in ClientsFunctions.cs; check API logs if saves fail. Project edit works and is a good alternative for deal-field testing.
- Devin browser coordinate clicks and Escape keypresses can be flaky on this app; devinid-based clicks are reliable. To close a Radix dialog, navigate to another route instead of pressing Escape.
- CDP at localhost:29229 may be unreachable for Playwright scripts; if you need a mobile-width check, try `playwright install chromium` first or note it as untested.
- Data written during testing goes to the real dev DB — record what you changed (allocations, rates, actuals) in the test report so it can be reverted.

## Devin Secrets Needed
- Azure access via `az login` device code (user-provided interactively); no stored secret. The SQL connection uses Entra auth from the az session.
