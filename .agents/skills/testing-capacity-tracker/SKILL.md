---
name: testing-capacity-tracker
description: Run and test the Capacity Tracker app (React/Vite web + Azure Functions API + Azure SQL) locally end-to-end. Use when verifying UI features, staffing/utilization workflows, or API changes.
---

# Testing Capacity Tracker end-to-end

## Local dev setup (preferred over live site)
The deployed Static Web App (https://salmon-desert-092eaec10.7.azurestaticapps.net) requires an interactive Entra ID login that can't be automated. Test locally instead:

1. Start Azurite (Functions needs a storage emulator): `azurite --silent --location /tmp/azurite &`. In non-interactive shells `azurite`/`func` may not be on PATH — use the nvm node bin (e.g. `export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"`) plus `export DOTNET_ROOT=$HOME/.dotnet; export PATH=$HOME/.dotnet:$PATH` for the API build.
2. API: `cd api && func start` (port 7071). Point it at the dev Azure SQL DB via the connection string in local.settings.json (server `sql-cap-dev-tfoiku.database.windows.net`, DB `Capacity`). Azure auth comes from the `az` CLI session.
3. Web: `cd web && npm run dev` (port 5173). The Vite dev server proxies `/api` to :7071.
4. Auth is mocked in dev: set `ALLOW_DEV_AUTH=true` on the API; the web app sends dev headers for `dev.user@example.com` with editor+leadership roles. No login screen appears.

## Golden-path flows to exercise
- **Availability cards**: /dashboard "Fully available" (booked=0) and "Partially available" (0<booked<capacity) cards — click each and verify drill-down row counts equal the card numbers for the current week.
- Note: Actuals and Revenue tabs may be hidden from nav/routes (utilization refocus); direct URLs should redirect to /dashboard. Cost/bill/manager fields may be hidden on People — check current sprint requirements before asserting their presence.
- **Bench → staffing**: /bench filters (practice, weeks, min free) → /allocations, click a person×week cell, add hours + "apply to following weeks" → verify bench free hours drop.
- **Utilization**: /utilization (C/P/A rows, RYG cells), /resource-summary (RYG status badges), /actuals (enter value, reload, check Resource Summary "Actual to date").
- **Clients/deals**: /clients/:id detail; project edit (win %, engagement type, deal value) on /projects.
- **Dashboards**: /dashboard stat cards and chart bars open drill-down dialogs; /executive-summary firm total should equal the sum of practice rows (verify arithmetic); /revenue weighted pipeline = pipeline × win probability.
- To see revenue numbers, at least one staffed person needs a bill rate (most seeded people have none — the page shows a "no bill rate" notice by design). Set one via People → Edit.

## Simulating sign-ins and roles (dev auth)
- The Vite proxy can inject dev-auth headers to simulate any user/role without a real login. Temporarily edit `web/vite.config.ts`:
  `"/api": { target: "http://localhost:7071", headers: { "x-dev-oid": "<guid>", "x-dev-email": "<email>", "x-dev-roles": "viewer" } }`
  Vite hot-restarts on config save (~3s); verify with `curl http://localhost:5173/api/me`. Revert the edit when done.
- A fresh `x-dev-oid` + existing person's email triggers the sign-in auto-link path (GET /api/me adopts the person, re-keys the PersonId to the OID and moves allocations/actuals).
- Person merge is on People → row Merge button (leadership only; the whole Actions column is hidden for viewer).

## Gotchas
- Dashboard briefly renders zeros (0%, 0 people) while loading — wait for data before asserting.
- Client edit (PUT /api/clients/:id) may fail with a 500 ("SqlServerRetryingExecutionStrategy does not support user-initiated transactions") — a known EF Core bug in ClientsFunctions.cs; check API logs if saves fail. Project edit works and is a good alternative for deal-field testing.
- Devin browser coordinate clicks and Escape keypresses can be flaky on this app; devinid-based clicks are reliable. To close a Radix dialog, click its × button (top-right corner) or navigate to another route instead of pressing Escape.
- To read Radix select options without a screenshot, parse the saved page HTML for `role="option"` entries (e.g. `re.findall(r'role="option"[^>]*devinid="(\d+)"[\s\S]*?<span[^>]*>([^<]+)</span>', html)`), then click the option's devinid.
- To deploy an unmerged PR branch to dev, use the same redeploy commands below from the checked-out branch (dotnet may only exist at `~/.dotnet/dotnet`).
- CDP at localhost:29229 may be unreachable for Playwright scripts; if you need a mobile-width check, try `playwright install chromium` first or note it as untested.
- Raw SQL in the API might reference wrong table names (e.g. `[ActualHours]` vs the actual `[Actuals]` table) — if an endpoint 500s with "Invalid object name", check func logs (/tmp/func.log) and compare against `CapacityDbContext` DbSet table mappings.
- Cleanup via SQL works with `sqlcmd -S sql-cap-dev-tfoiku.database.windows.net -d capacity --authentication-method ActiveDirectoryDefault -Q "..."` (uses the az session).
- Data written during testing goes to the real dev DB — record what you changed (allocations, rates, actuals) in the test report so it can be reverted.
- Over-capacity warnings are transient toasts — capture a screenshot immediately after Save, and add a recording annotation the moment the toast appears; the toast text is also readable from the page HTML dump if the screenshot misses it.
- Numeric inputs prefilled with a default (e.g. invoice amount defaulting to the forecast) append typed digits to the existing value — set the value via a native setter + `input` event, or select-all first, then verify the visible value before saving.
- The range staffing dialog ("Staff <person>") numeric inputs (Weeks, Hrs/week) are clamped controlled inputs: typing can momentarily produce clamped values (e.g. appending a digit yields 41→52). Set values by selecting all text first, or via a native value setter + `input` event in the console, then verify the visible value before saving.
- To revert a temporary staffing-range allocation via the UI, reopen the same Staff dialog with the identical project/start week/weeks and save with Hrs/week = 0, then verify via `GET /api/allocations?personId=…&weekStart=…&weeks=1` returns `[]`.
- Holiday-capacity checks: use Labor Day week (Mon Sep 7 2026 → 32h cap) with Aug 31 as the 40h control week; the person profile shows a "Holiday (32h cap)" badge and the tracker computes Available from the reduced capacity.
- Native HTML date inputs may mangle typed values (e.g. "60803-02-02"); set them via Playwright `.fill()` or a native value setter + `input` event instead of keystrokes.
- The browser tool's file-chooser (`select_file`) may fail on the Contract Documents upload. Workaround: find Chrome's ephemeral CDP port (`lsof -iTCP -sTCP:LISTEN -p $(pgrep -f remote-debugging)` or check the launch args), attach Playwright with `connect_over_cdp`, and call `set_input_files` on the page's `input[type=file]` — the app's own upload path is still exercised.
- Pricing-plan lifecycle expectations: Closed/Won locks plan setup but weekly hours/staffing stay editable with a required reason (the UI prompts "Reason for post-win change"; the API returns 400 without one) and Revised Forecast phasing stays editable (Original Plan is immutable); Closed/Lost is fully read-only (API returns `400 Closed/Lost plans are read-only.` on phasing PUTs) and releases pipeline bookings from the tracker immediately.
- Cleanup of won/lost test plans: Closed/Won plans have no Delete button — instead remove staffing from the project (Delivery team → Remove), archive the project(s) from /projects (note: converting a plan can leave both the original pipeline project and the plan's project — archive both), delete the Closed/Lost plan from its detail page, and remove any temporary rate-card rows from /ratecard.
- Documents download verification: extract the real `/api/projects/:id/documents/:docId` URL from the page anchor rather than guessing it, then compare MD5 against the source file.
- Plan weekly-hours cells (InlineInput number inputs) select-all on focus, but the browser tool's click can drop that selection — typed digits then append (40 + "5" → 405) and the API's 0–168h validation rejects the save, so the cell silently reverts to the old value (watch for very fast ~3ms SetPlanLineHours responses in func logs = 400s). Workaround: click the cell with the browser tool, then send OS-level keys with `xdotool key ctrl+a && xdotool type "5" && xdotool key Return` — this keeps the interaction in the visible UI.
- Staffing-conflict badge/card (pricing plan detail): to trigger it, name a person who already has bookings in a plan week and give the plan enough hours that total booked > holiday-adjusted capacity while the plan is Active Pursuit; the card shows `MM-DD (Xh vs Yh)`. Reducing the week's hours in the grid should clear the badge/card without a reload (allocations query invalidation) — assert on the same page, no navigation.
- Deleting a plan from its detail page releases its auto-booked pipeline hours immediately, but leaves the plan's project and client behind — projects/clients still have no UI delete (archive/merge only), so full cleanup may need SQL (delete Allocations → Projects → Clients rows) and should be flagged as a deviation in the report.
- The People edit dialog's Save button sits below the fold — scroll the dialog's inner container (scroll at the dialog center, may take two scrolls) until Save is visible before clicking; clicking a tag's × removes it (aim at the × glyph, not the badge center).

- Invoicing/rollups cleanup: rate-card rows and the project job code are deletable via UI. Invoice records now have a trash icon on the captured card (audited, with confirmation), and firm targets have a per-month clear button in the /rollups Targets dialog — prefer these over sqlcmd; fall back to SQL only if the UI delete is missing/broken.
- Invoice variance report (/projects/:id/invoicing): the "Invoice variance — all periods" card lists every billing period with forecast vs captured, variance $/%, and cumulative columns; uncaptured periods must show "—" and NOT count toward cumulative invoiced/variance. Export CSV lands as invoice-variance.csv in /tmp/chisel_browser_downloads.
- Clearing a plan line's weekly hours via `PUT /plans/:id/lines/:lineId/hours` with an empty `weekHours` array is a no-op — send every existing week explicitly with `hours: 0` (read the current weeks from the plan GET first).
- After saving an invoice capture, the card can briefly render empty — re-navigate to the invoicing page before asserting persistence.
- Stacked PRs: squash-merging a PR whose base is another PR's branch lands the commit on that intermediate branch, NOT the default branch — after merging a stack, verify `git log` on the default branch actually contains the top PR's changes; if not, cherry-pick the squashed commit onto default and open a follow-up PR.
- CI (`ci.yml`) may only trigger on PRs targeting `main`/`develop`; PRs to other default branches can show zero checks — run lint/build/tests locally instead of waiting.
- Verify a web deploy by comparing the hashed asset name (`assets/index-*.js`) in the live site's HTML vs local `dist/index.html`; verify the API deploy from the zip-deploy response (`provisioningState: Succeeded`, `end_time`) — `az functionapp show lastModifiedTimeUtc` can be stale/misleading.

- Delivery Health (/delivery-health) testing: force a red state via the delivery page's "Override ETC" (e.g. hours above baseline, fees above TCV, justification required) — the row flips to "Needs attention" with hours/fee overrun alerts and the dashboard "Delivery health" card count increments; clear the override to restore. Status cards act as table filters (click again to unfilter). CSV export lands in /tmp/chisel_browser_downloads or ~/Downloads.

## Live site failing but local passing? Check for stale deployment
- The GitHub "Deploy Dev" workflow only triggers on pushes to `develop`, but merges land on the default branch — the live dev site can silently fall behind merged code.
- Compare the Function App's last deploy time vs the merge time: `az functionapp show -n func-cap-dev-tfoiku -g rg-capacity-dev --query lastModifiedTimeUtc` (or Kudu `/api/deployments`) against `git log -1 --format=%cI` on the default branch.
- Redeploy API: `dotnet publish -c Release -o /tmp/apipub && (cd /tmp/apipub && zip -qr /tmp/api.zip .) && az functionapp deployment source config-zip -n func-cap-dev-tfoiku -g rg-capacity-dev --src /tmp/api.zip`.
- Redeploy web: `cd web && npm run build && npx @azure/static-web-apps-cli deploy ./dist --deployment-token $(az staticwebapp secrets list -n swa-cap-dev-tfoiku -g rg-capacity-dev -o tsv --query properties.apiKey) --env production`.
- Direct calls to the Function App host 401 (SWA-linked backend); test via the SWA or locally instead.
- `az monitor app-insights` commands may hang for minutes on first use (extension install); use `timeout` and answer the install prompt.

## Devin Secrets Needed
- Azure access via `az login` device code (user-provided interactively); no stored secret. The SQL connection uses Entra auth from the az session.
