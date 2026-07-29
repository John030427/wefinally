# Date Coordination Form UI Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every date preference control reliably tappable and visibly selected, clarify text inputs, and enlarge the AI/human assistance actions.

**Architecture:** Keep the existing page state and handlers. Replace interactive `text` nodes with block-level `view` controls, derive selected classes directly from `form`, and improve only page-local WXML/WXSS.

**Tech Stack:** WeChat Mini Program WXML/WXSS/JavaScript, Node.js assertion selfchecks.

## Global Constraints

- Preserve the existing coordination API and state machine.
- Do not submit a real invitation during UI testing.
- Do not commit Git changes.

---

### Task 1: Add UI contract coverage

**Files:**
- Modify: `server/selfcheck/agent-ui.js`

- [ ] Assert interactive choices use `view`, dynamic selected classes, and accessible selected markers.
- [ ] Assert area and transport inputs have dedicated visual classes and helper text.
- [ ] Assert AI coordinator and human service use full-card tap targets with titles and descriptions.
- [ ] Run `node selfcheck/agent-ui.js` from `server` and verify it fails for the missing UI contract.

### Task 2: Repair choices and form fields

**Files:**
- Modify: `miniprogram/pages/date-coordination/date-coordination.wxml`
- Modify: `miniprogram/pages/date-coordination/date-coordination.wxss`

- [ ] Replace choice `text` elements with block-level `view` controls.
- [ ] Bind selected classes to periods, activities, budget, payment preference, and duration.
- [ ] Add a check marker and stronger pink selected styling without changing form values or handlers.
- [ ] Give area and transport inputs explicit height, border, background, and helper copy.

### Task 3: Improve assistance actions and verify

**Files:**
- Modify: `miniprogram/pages/date-coordination/date-coordination.wxml`
- Modify: `miniprogram/pages/date-coordination/date-coordination.wxss`
- Test: `server/selfcheck/agent-ui.js`

- [ ] Replace compact footer rows with two large full-card actions.
- [ ] Run `npm run selfcheck:agent` and confirm all checks pass.
- [ ] Compile and tap each control in WeChat DevTools at a phone viewport.
- [ ] Confirm no real invitation is sent during visual verification.
