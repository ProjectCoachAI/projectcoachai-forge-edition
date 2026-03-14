# Stability Checklist

Use this checklist before and after every connect/auth change.

## Scope Guardrails

- Change only approved files/surfaces for this step.
- No feature work mixed with reliability fixes.
- If 2 consecutive fixes fail, stop patching and switch to trace-first diagnosis.
- Record exactly what changed and what was intentionally not touched.

## Pre-Change Baseline (Pass/Fail)

- Hero profile icon opens Profile dashboard (AI performance overview).
- Hero/workspace connect routes to Profile Connected AI Accounts.
- Provider sign-in popup opens once (no popup/pane loop).
- Returning to Profile does not show hidden AI pane bleed-through.
- `Done` confirmation on Profile updates status correctly.

## Post-Change Regression (Pass/Fail)

- No repeated popup reopen loop after red close.
- Not-logged-in provider does not remain falsely connected.
- Logged-in provider can be confirmed connected from Profile flow.
- Back navigation from Profile returns to expected page.
- Compare and Synthesize/Forge basic navigation still loads.

## Release Gate

Only proceed when all post-change checks pass.
