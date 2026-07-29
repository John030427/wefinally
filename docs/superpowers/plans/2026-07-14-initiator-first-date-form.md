# Initiator-First Date Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the initiating user complete and privately save the first-date form before the partner receives an invitation.

**Architecture:** Add a `collecting_initiator` state before `inviting_partner`. The initiator's application is stored in `date_applications`; submission advances the coordination and creates an idempotent notification job for the invitee. The invitee never receives the initiator's raw application.

**Tech Stack:** WeChat mini program, Node.js cloud function, CloudBase database, existing selfcheck tests.

## Global Constraints

- Keep both participants' raw applications private.
- Only `share_message` is explicitly shareable; do not return it before the invitee accepts.
- Preserve existing API paths and database collections.
- Use the existing pink, warm visual language and add readable, restrained emoji to form choices.
- Do not commit until user testing is complete.

---

### Task 1: State Machine And Cloud Workflow

**Files:**
- Modify: `miniprogram/cloudfunctions/api/lib/dateCoordinationPolicy.js`
- Modify: `miniprogram/cloudfunctions/api/handlers/dateCoordination.js`
- Test: `server/selfcheck/date-coordination-policy.js`
- Test: `server/selfcheck/date-coordination-cloud.js`

- [ ] Add failing assertions for `collecting_initiator -> inviting_partner`.
- [ ] Verify the initiator can submit only in the new state and the invitee cannot.
- [ ] Save the initiator application before creating the invitation notification job.
- [ ] Verify B's DTO excludes A's raw application and share message.

### Task 2: Mini Program Form Flow

**Files:**
- Modify: `miniprogram/pages/date-coordination/date-coordination.js`
- Modify: `miniprogram/pages/date-coordination/date-coordination.wxml`
- Test: `server/selfcheck/agent-ui.js`

- [ ] Add failing UI contract assertions for the initiator-first state and emoji choice labels.
- [ ] Show the form during `collecting_initiator` and change submit copy to “保存并邀请对方”.
- [ ] Show the waiting invitation card only after the initiator submits.
- [ ] Keep partner acceptance and independent partner form behavior unchanged.

### Task 3: Verification And Deployment

**Files:**
- Verify all modified files.

- [ ] Run `npm run selfcheck:agent` from `server`.
- [ ] Run `git diff --check`.
- [ ] Deploy the `api` cloud function with dependencies included.
- [ ] Verify A can submit, CloudBase stores one application and one notification job, and B can accept without seeing A's raw form.
