# Customer Service Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-admin customer service workbench with a restricted customer-service admin role.

**Architecture:** Reuse the existing `/admin` SPA and `/api/admin/*` APIs. Add a DB `admin.role` column, put `admin_role` into the JWT, gate admin routes by allowlisted pages/actions, and add a unified `service` page that reads existing chat, handoff, and order APIs.

**Tech Stack:** Express, MySQL, vanilla admin HTML/JS, existing selfcheck scripts.

## Global Constraints

- Do not build a separate客服系统 in this phase.
- Keep existing super admin behavior compatible.
- Customer service may read/reply customer-service conversations, process official handoff tickets, and inspect order status.
- Customer service must not access data export, partner finance/withdrawal review, whitelist import, or user mutation APIs.
- No new runtime dependencies.

---

### Task 1: Role And Permission Test

**Files:**
- Create: `server/selfcheck/customer-service-workbench.js`
- Modify: `server/selfcheck/run-all.js`

**Interfaces:**
- Consumes: `signToken`, `request`, `adminToken`, `pool`, `ok` from `server/selfcheck/_helpers.js`.
- Produces: A selfcheck that fails until role login, route gating, and workbench UI exist.

- [ ] **Step 1: Write the failing test**

Create a selfcheck that asserts:
- admin HTML includes `data-p="service"` and `function pgService`.
- admin route includes `requireAdminAccess`.
- `customer_service` token can call `/api/admin/service/workbench`, `/api/admin/orders`, `/api/admin/chat/sessions`, `/api/admin/handoff/tickets`.
- `customer_service` token cannot call `/api/admin/export/orders`, cannot update `/api/admin/users/:id`, and cannot import `/api/admin/whitelist/import`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/selfcheck/customer-service-workbench.js`

Expected: FAIL before implementation.

### Task 2: Backend Role And Workbench

**Files:**
- Modify: `server/src/config/constants.js`
- Modify: `server/src/middleware/auth.js`
- Modify: `server/src/routes/auth.js`
- Modify: `server/src/routes/admin.js`
- Modify: `database/init.sql`
- Create: `database/patch-012-admin-service-role.sql`
- Modify: `database/import.bat`

**Interfaces:**
- Produces: JWT payload `{ role: 'admin', admin_role: 'super_admin' | 'customer_service' | 'finance' | 'auditor' }`.
- Produces: `GET /api/admin/service/workbench`.

- [ ] **Step 1: Implement minimal backend changes**

Add admin role constants, default missing DB role to `super_admin`, route guard helper, and the service workbench endpoint.

- [ ] **Step 2: Run backend selfcheck**

Run: `node server/selfcheck/customer-service-workbench.js`

Expected: backend assertions pass once frontend strings are present.

### Task 3: Admin Workbench UI

**Files:**
- Modify: `server/public/admin/index.html`

**Interfaces:**
- Consumes: `d.admin.role` from `/api/auth/admin-login`.
- Consumes: `/api/admin/service/workbench`.
- Produces: `服务工作台` page.

- [ ] **Step 1: Add role-aware navigation**

Store `wf_admin_role`; hide nav items not allowed for `customer_service`; default customer service page is `service`.

- [ ] **Step 2: Add service page renderer**

Render three tables/cards:待处理会话、奔现工单、最近订单. Provide quick actions to reply chat and process handoff tickets using existing functions.

- [ ] **Step 3: Run UI selfcheck**

Run: `node server/selfcheck/customer-service-workbench.js`

Expected: PASS.

### Task 4: Verification

**Files:**
- Existing changed files only.

- [ ] **Step 1: Syntax checks**

Run: `node --check server/src/routes/admin.js && node --check server/src/routes/auth.js && node --check server/src/middleware/auth.js && node --check server/src/config/constants.js && node --check server/selfcheck/customer-service-workbench.js && node --check server/selfcheck/run-all.js`

- [ ] **Step 2: Behavior checks**

Run: `node server/selfcheck/customer-service-workbench.js`

- [ ] **Step 3: Regression checks**

Run: `node server/selfcheck/admin-web.js`

- [ ] **Step 4: Whitespace check**

Run: `git diff --check`
