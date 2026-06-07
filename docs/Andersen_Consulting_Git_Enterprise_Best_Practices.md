# Andersen Consulting Git Enterprise Best Practices & Setup Guide
**Infrastructure & Platform Engineering**  
*Version 2.1 | Confidential — Internal Use Only*

---

## 1. Introduction
This document outlines the best practices for setting up and governing Git Enterprise at Andersen Consulting. It is designed to serve as the foundational reference for Infrastructure, Platform Engineering, and delivery teams responsible for configuring and maintaining the firm's source control environment.

Andersen Consulting operates in a multi-stakeholder environment. The Git Enterprise instance serves the firm's own internal engineering teams, client project teams whose code is ultimately delivered to those clients, and collaborating firms who may co-develop or partially own project repositories. This combination of tenants creates specific requirements around access isolation, intellectual property boundaries, identity management, and lifecycle governance that a standard single-org setup does not address.

> **Guiding Principle:** Every client is a separate tenant. Clean boundaries, explicit access grants, automatic expiry, and clear IP ownership are non-negotiable from day one.

---

## 2. Organization & Hierarchy Structure
The organization structure is the most consequential architectural decision in any multi-tenant Git setup. Andersen Consulting operates across three distinct groups of activity — each with different access, ownership, and confidentiality requirements — and the GitHub Enterprise Cloud org structure mirrors these groups directly.

| Org | Purpose | IP Ownership | External Access |
| --- | --- | --- | --- |
| **ac-corporate** | Back-office & internal enterprise apps | 100% AC | Never |
| **ac-investment** | Firm-funded accelerators, frameworks, R&D | 100% AC (default) | Case-by-case, collab firms only |
| **[client-code]** | All code for a given client engagement | Mixed — see §4.1 | Clients (read) + collab firms (write, scoped) |

### 2.1 Corporate Org (`ac-corporate`)
Houses everything built to run Andersen Consulting's own firm operations — ERP integrations, HR portals, finance tooling, internal compliance automation, and infrastructure-as-code for firm systems. Nothing here is ever client-facing or shared with collaborating firms. No external account of any kind is granted access, even read-only.

### 2.2 Investment Org (`ac-investment`)
Houses code funded by Andersen Consulting investment budgets — accelerators, platform frameworks, reusable libraries, and R&D initiatives intended for deployment into future client engagements. This org is the firm's IP engine and must be tightly controlled.

By default, this org is strictly internal. Collaborating firms may be granted access to specific repos under a formal joint investment agreement — see Section 4.2 for governance rules. The access matrix in §2.4 defines the precise scope.

When investment IP is ready to deploy into a client engagement, the promotion workflow is:
1. **Mark as Template:** Mark the investment repo as a GitHub Template Repository in `ac-investment` (Platform Eng).
2. **Provisioning Request:** Engagement Lead raises a provisioning request referencing the investment repo (Engagement Lead).
3. **Fork/Initialize:** A new repo is forked/initialized from the template into the client org — it diverges immediately and is client-scoped from that point (Git Admin).
4. **Maintain Source:** The original repo stays in `ac-investment`, unchanged, reusable for future engagements (Platform Eng).
5. **IP Flow-back:** Any improvements from the client engagement eligible to flow back must pass IP review before merging to `ac-investment` (Engagement Lead).

> **Key Rule:** The investment repo is never transferred to or modified directly for a client engagement. The fork is the client's copy. The original stays in `ac-investment`, clean and reusable.

### 2.3 Client Orgs (`[client-code]`)
Each client engagement gets its own dedicated GitHub organization with a short client code — e.g. `acme` or `globex`. Client orgs contain two types of code: Andersen-developed IP deployed into the engagement (AC IP), and code built as a deliverable for the client (Client IP). These live in the same org, distinguished by naming convention and controlled by team permissions.

| Attribute | AC IP Repos | Client IP Repos |
| --- | --- | --- |
| **Naming** | `[client-code]-ac-[name]` (e.g., `acme-ac-auth-sdk`) | `[client-code]-[component]` (e.g., `acme-portal-backend`) |
| **Owned by** | Andersen Consulting | Client |
| **Client Access** | None | Read |
| **Collab Firm Access**| None | Write (if on delivery team) |
| **At Closeout** | Stays with AC | Exported or org transferred to client |
| **IP Flow-back** | Yes — via IP review to `ac-investment` | No |

Every client org uses the same four-team structure:
* **`[client]-delivery`**: Write access to all repos. Members: AC engineers on the engagement.
* **`[client]-ac-ip-team`**: Write access to AC IP repos only. Members: AC engineers + Platform Eng. No client access.
* **`[client]-client-stakeholders`**: Read access to Client IP repos only. Members: Named client contacts. Read-only.
* **`[client]-collab-delivery`**: Write access to Client IP repos only. Members: Collaborating firm engineers. No AC IP access.

### 2.4 Enterprise-Wide Access Matrix
The table below is the single source of truth for access decisions across all org groups. No role may be elevated beyond what is shown here without written approval from Git Admin and the CISO.

| Role | `ac-corporate` | `ac-investment` | Client Orgs |
| --- | --- | --- | --- |
| **AC Git Admins** | Admin | Admin | Admin |
| **AC Platform Engineers** | Write | Write | Write |
| **AC Delivery Engineers** | No Access | No Access | Write |
| **Client Stakeholders** | No Access | No Access | Read |
| **Collab Firm Engineers** | No Access | Read* | Write |
| **CI/CD Service Accounts** | No Access | Write | Write |

*\* Collaborating firm access to `ac-investment` is granted only under a formal joint investment agreement, scoped to specific repos, for the duration of the agreement only.*

### 2.5 Naming Conventions
Naming conventions are mandatory across all orgs and enforced at provisioning time.

| Entity | Convention | Example |
| --- | --- | --- |
| **Corporate repos** | `ac-corp-[system]` | `ac-corp-hr-portal` |
| **Investment repos** | `ac-[initiative]-[component]` | `ac-data-platform-ingest` |
| **Client org** | `[client-code]` | `acme` / `globex` |
| **Client IP repos** | `[client-code]-[component]` | `acme-portal-backend` |
| **AC IP in client org** | `[client-code]-ac-[name]` | `acme-ac-auth-sdk` |
| **Teams** | `[client-code]-[role]` | `acme-delivery` / `acme-client-stakeholders` |

---

## 3. Identity & Access Management
Access management is the highest-risk area of any multi-tenant Git environment. Over-provisioned access, shared accounts, or accounts that outlive their engagement are the most common source of data breaches and IP leakage in consulting contexts.

### 3.1 Authentication
* Integrate SSO/SAML for all Andersen Consulting employees using the firm's corporate Identity Provider (Okta or Azure AD). Joiners and leavers are managed automatically through this integration.
* Collaborating firm staff and client stakeholders must use managed external or guest accounts — they must not be added to the corporate SSO domain.
* Enable SCIM provisioning so that account deprovisioning is automatic when someone leaves a connected organisation.
* Enforce MFA for every account without exception. This is non-negotiable for external accounts.
* No shared or generic accounts. Every human user has a named account. CI/CD pipelines use dedicated machine accounts with scoped tokens.

### 3.2 Authorization
Access follows a least-privilege model at every level. The enterprise-wide access matrix in Section 2.4 is the definitive reference. Additional rules:
* Access is granted per engagement and reviewed quarterly.
* All external access carries a hard expiry date tied to the contract end date, set at account creation and enforced automatically.
* No engineer — regardless of seniority — is granted org-owner access. Only designated Git Administrators hold this privilege, and their access is audited.

---

## 4. Ownership & Intellectual Property Separation
IP boundary management is a defining challenge for consulting firms. The consequences of getting this wrong — accidental co-mingling of client code with firm IP, or ambiguous ownership at engagement end — can be contractually and legally significant.

### 4.1 Client IP
Each client's code lives exclusively within their dedicated org. The org structure and team permissions in Section 2.3 ensure clients receive a clean export or ownership transfer at engagement end.

Andersen Consulting's reusable IP lives in `ac-investment`. Client engagements consume it via the fork/template promotion workflow in Section 2.2 — it never lives natively in a client org.

The IP boundary for each engagement must be documented in the root README of every client repo and reflected in the engagement's legal schedule.

> **Critical Rule:** Never mix client code and firm IP in the same repository — even in separate directories or branches. If you find yourself wanting to, that is the signal to create a proper separation instead.

### 4.2 Collaborating Firm IP
* Collaborating firm engineers work within the client org, scoped exclusively to Client IP repos via the `[client]-collab-delivery` team. They have no access to AC IP repos, `ac-investment`, or `ac-corporate` under any circumstances.
* Collaborating firm engineers are never granted access to `ac-investment` unless a formal joint investment agreement is in place — in which case access is outside-collaborator scoped to specific repos only, for the duration of the agreement, and revoked automatically at expiry.
* The IP ownership terms for any collaborating firm contribution must be defined contractually before the firm's engineers are granted access. Git Admin requires sight of the relevant agreement before provisioning.
* At engagement end, collaborating firm access to the client org is revoked on the same date as all other external access — the contract end date, enforced automatically.

---

## 5. Branching Strategy & Repository Governance

### 5.1 Approved Branching Models
Trunk-based development is the default for most client engagements — simpler, faster, and aligned with continuous delivery. No other model is approved without explicit sign-off from the Tech Lead and Git Admin.

### 5.2 Branch Protection Rules
The following protections are mandatory on all repos, enforced via org-level rulesets:
* `main` and `develop` (where applicable) are always protected — no direct pushes.
* All changes to protected branches require a pull request.
* **Review Requirements (Copilot Policy)**:
  * **Standard Repositories**: If the GitHub Copilot review comes back clean and the CI matrix is green, the PR author is permitted to merge their own pull request. This satisfies ISO 27001 A.8.32 and A.5.3 by providing an independent, evidenced check on the change (Copilot Review + CI matrix + Audit log).
  * **Production-Critical Repositories**: A minimum of one human approval is required in addition to the Copilot review and green CI checks.
  * **Contractual Mandates**: Any specific client contracts calling for two-person human review must be strictly honored.
* Force pushes and branch deletion are disabled on all protected branches.

### 5.3 Repository Governance
* Repository creation is not self-service. All new repos are provisioned through the GitOps request process managed by Git Admin.
* Every repository must have: a designated owner (named individual), a root README including engagement reference and IP ownership statement, a CODEOWNERS file, and an agreed archival date.
* Naming conventions follow the standards in Section 2.5 and are enforced at provisioning time.
* Template repositories for common project types (API services, frontend apps, Terraform modules, data pipelines) are maintained in `ac-investment`. All new repos must be initialized from the appropriate template.

---

## 6. CI/CD Integration
Andersen Consulting operates shared CI/CD infrastructure for internal projects and isolated runner environments for client engagements. This separation is essential for data isolation and client compliance requirements.

* Shared runners are used exclusively for `ac-corporate` and `ac-investment` repos. They must never be assigned to client orgs.
* Each client org is allocated dedicated, isolated runners — not shared between different client orgs under any circumstances.
* All pipeline secrets are stored in the firm's approved secrets manager. Secrets in Git repositories — including private ones — are strictly prohibited.
* Pipeline templates are maintained centrally in `ac-investment` and consumed by reference in client project pipelines. They are not copy-pasted.
* CI/CD machine account tokens are scoped to minimum required permissions and rotated quarterly.

### 6.1 Mandatory CI/CD Pipeline Gates
To ensure compliance and code quality without vendor lock-in, the default pipeline template in `ac-investment` must enforce the following free or open-source software (OSS) gates on every Pull Request:
1. **Lint and Format**: Check code style and formatting using language-native tooling (e.g., `ruff` for Python, `eslint` for JavaScript/TypeScript, `dotnet format` for .NET, `gofmt` for Go).
2. **Unit Tests with Coverage Floor**: Execute unit test suites. A coverage floor of **80%** is enforced by default, configurable via repository settings.
3. **SAST (Static Application Security Testing)**: Integrate scanning via GitHub CodeQL (utilizing our existing GitHub Advanced Security license), with Semgrep Community Edition as a fallback scan.
4. **SCA (Software Composition Analysis)**: Scan and update dependencies using native GitHub Dependabot.
5. **Secret Scanning**: Block commits exposing credentials using GitHub's built-in secret scanning and pre-receive hooks or pull request scans (e.g., Gitleaks).
6. **IaC Scanning**: Scan infrastructure-as-code files (Terraform, Bicep, CloudFormation) using Checkov or tfsec.
7. **Container Scanning**: Scan any generated container images using Trivy.
8. **Copilot Code Review**: Automate pull request reviews via GitHub Copilot review.
9. **Integration Tests**: Execute integration test suites on merging to the `main` branch.
10. **DAST (Dynamic Application Security Testing)**: Run a DAST scan via OWASP ZAP on deployments to the staging environment.

---

## 7. Security, Audit & Compliance

### 7.1 Audit Logging
* Audit logging is enabled from initial setup. Logs capture all access events, permission changes, repo creation and deletion, and push/merge activity.
* Audit logs are exported to the firm's centralised SIEM in real time — not stored only within Git Enterprise.
* Log retention follows the firm's data retention policy, with a minimum of 24 months for client engagement repos.

### 7.2 Secret Scanning & Push Controls
* Secret scanning is enabled at the organisation level on all orgs. Pre-receive hooks (e.g. Gitleaks) are configured to block pushes containing known secret patterns.
* Large file policies are enforced to prevent accidental commits of data files or build artefacts containing sensitive information.
* SAST scanning is integrated into the default pipeline template and runs on every pull request to a protected branch.

### 7.3 Secure Design & Requirements (OWASP SKF)
Andersen Consulting adopts the OWASP Security Knowledge Framework (SKF) as the baseline for developer education and application security requirements to shift security to the design phase.
* **Requirements Baseline**: Prior to writing code, developers or AI coding assistants must consult OWASP SKF to identify applicable security requirements and Application Security Verification Standard (ASVS) controls.
* **Spec-Time Integration**: Security controls and design decisions must be documented in feature specifications from day one, rather than checked at merge time.
* **AI Context Injection**: Relevant SKF requirements and ASVS controls must be injected into developer workflows, IDE skills, and AI assistant prompts (such as GitHub Copilot and custom agents) to ensure generated features carry built-in security mappings.
* **Compliance Mapping**: This design-first methodology satisfies auditor evidence requirements for ISO 27001 A.8.25 (Secure development lifecycle), A.8.26 (Application security requirements), and A.8.27 (Secure system architecture and engineering principles).

### 7.4 Access Reviews
* Quarterly automated access reports list every user, their role, access scope, and account expiry date. These are reviewed by Git Admin and relevant engagement leads.
* Any account without a confirmed active engagement association is flagged for deprovisioning within five business days.
* Collaborating firm and client accounts that have passed their expiry date are automatically suspended — not just flagged.

---

## 8. Engagement Closeout & Offboarding
Engagement closeout is one of the most operationally neglected areas of Git governance in consulting firms. A formal, consistently executed closeout process protects both Andersen Consulting and its clients.

* At engagement end, the client receives a full export or ownership transfer of their org as defined in the contract. Git Admin verifies completeness before the engagement is closed.
* All external access is revoked on the contractual end date regardless of whether handoff has been completed. If handoff requires continued access it must be extended under a written amendment.
* The client org is archived in read-only state. It is never deleted. Archived repos may be required for post-engagement audits, legal discovery, or warranty support.
* Any AC-owned components developed or enhanced during the engagement are extracted and contributed back to `ac-investment` through the IP review process before the engagement is closed.

> **Retention Policy:** Archive, never delete. Engagement repos must be retained in a read-only archived state for a minimum of five years post-engagement closeout, or as required by client contract or applicable regulation.

---

## 9. Documentation, Onboarding & Support
The effectiveness of any governance framework depends on whether the people using it understand it and can operate within it without friction.

* A Git Enterprise Handbook is maintained in `ac-corporate`. It covers all firm standards, how to request repos, branching model selection guidance, access request procedures, and escalation paths.
* A standardised project onboarding checklist is completed by every engagement lead at project kickoff — covering org provisioning, access setup, runner allocation, secrets configuration, and pipeline initialisation.
* A dedicated support channel or ticketing queue is maintained by Git Admin so that engineers can raise issues without resorting to workarounds.
* All changes to firm-wide Git standards are communicated to engagement leads and tech leads with a minimum of two weeks notice before taking effect.

---

## 10. Summary — Key Principles
The following principles underpin every decision in this document and should be applied whenever new scenarios arise that are not explicitly covered:

| Principle | What It Means in Practice |
| --- | --- |
| **Multi-tenancy by design** | Every client and collaborating firm is a separate tenant from day one — not an afterthought. |
| **Three-org model** | Corporate, Investment, and Client orgs each have distinct purposes, access rules, and IP ownership. Don't blur the lines. |
| **Investment IP is firm IP** | `ac-investment` is the engine of AC's competitive advantage. Protect it, version it, and promote it deliberately — never give it away accidentally. |
| **Least privilege, always** | Access is granted only to what is needed, for as long as it is needed, and no more. |
| **IP boundaries are contractual**| Code ownership is determined by the contract, not by where a repo happens to live. |
| **Automate access expiry** | Human-dependent deprovisioning will fail. Automate it. |
| **Archive, never delete** | You will always need old repos — for audits, legal, or warranty. Five-year minimum retention. |
| **Standards reduce risk** | Consistent naming, branching, and governance across all projects reduces errors and makes audits tractable. |

---
*Andersen Consulting | Infrastructure & Platform Engineering | Confidential — Internal Use Only*
