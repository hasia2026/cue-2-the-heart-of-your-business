# Workspace Studio — Design Spec

**Date:** 2026-10-20
**Status:** Draft for review
**Owner:** Buffy (design agent), reviewed by product owner

## Summary

Workspace Studio lets every business owner shape their CUE workspace: name and tune their AI Ambassador, brand every surface the customer sees, choose which modules appear in their sidebar (and what they're called), and get there through a skippable guided setup. One `workspace_profile` row per organization backs all four; every change applies app-wide and to every outward-facing artifact.

## Goals

1. **Ambassador persona** — owners give their AI Ambassador a name, avatar emoji, greeting line, and tone; the widget and LLM voice reflect it.
2. **Visual branding** — business name, logo, accent color, contact info, and theme default; injected into the app UI *and* every customer-facing artifact (quotes, digest emails, leave-behind pages, public book/compare/score pages).
3. **Modular layout** — owners hide modules they don't use and rename nav items; renamed names and hidden modules apply to sidebar, dashboard cards, and route guards.
4. **Guided setup** — a skippable onboarding wizard walks new owners through persona → branding → modules; finishable from Settings later.

## Non-goals

- No multi-brand accounts within one org (one workspace profile per organization).
- No custom CSS injection — owners pick from validator-approved palettes and stock emoji/logo presets.
- No redesign of individual pages; they inherit the profile.

## Architecture

**Data model.** New table `workspace_profiles`, one per org:

```sql
create table workspace_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  ambassador_name text,
  ambassador_avatar text,           -- emoji
  ambassador_tone text,             -- 'friendly' | 'formal' | 'concise' | 'enthusiastic'
  ambassador_greeting text,
  brand_logo_url text,
  brand_accent text,                -- hex, validated
  brand_contact_phone text,
  brand_contact_email text,
  theme_default text,               -- 'system' | 'light' | 'dark'
  modules jsonb not null default '{}',   -- { "pipeline": { "enabled": true, "label": "Deals" } }
  setup_completed jsonb not null default '{}', -- { "persona": true, "branding": true, "modules": true }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Row is created lazily (absent = stock behavior), so nothing breaks for existing orgs.

**Read path.** `src/lib/workspace-profile.ts` exports `getWorkspaceProfile(orgId)` returning a typed object with sensible defaults when no row exists. Server components and route handlers call it directly; a client context in `AppShell` passes it through `useWorkspaceProfile()` for the sidebar and Ambassador widget.

**Write path.** Server actions in `src/app/(app)/settings/actions.ts` (new `saveWorkspaceProfile*` actions, one per wizard step) validate inputs (accent palette whitelist, emoji length ≤ 4, tone enum, module key against registry) and upsert. Only org OWNER/MANAGER roles can write; existing `requireRole` helper already exists in `auth.ts`.

**Modules.** `src/lib/modules.ts` exports the module registry (key → path, default label, admin-only flag). `AppShell` filters by enabled+label. Route guard middleware checks `enabled` per org and redirects to dashboard with a notice if disabled. Dashboard module cards skip disabled modules.

**Persona → Ambassador.** `AmbassadorWidget` reads profile; name/avatar/greeting replace the stock values. `ambassadorAnswer()` accepts optional persona, threading tone and name into the LLM system prompt and the outbound assistant framing so follow-up emails and the AI Ambassador speak consistently.

**Branding → outward surfaces.**

- Quotes HTML (`src/lib/quote.ts`): org name → `brand_name || org.name`, logo, accent color, contact line footer.
- Digest emails (`src/lib/digest.ts`): accent color header bar + footer contact.
- Leave-behind / print pages: read the same profile instead of hard-coded copy.
- Public book / compare / score pages: accent + logo.

**Wizard.** `src/app/(app)/onboarding/page.tsx` renders 3 steps (persona → branding → modules). Reachable three ways: auto-redirect for owners who signed up in the last 7 days with incomplete steps, dashboard checklist card, or Settings "Workspace Studio → Re-run guided setup". Skippable at every step; `setup_completed` drives the checklist ticks. Never blocks non-owners.

## Error handling

- Invalid/unknown module keys are silently dropped rather than throwing (malformed stored JSON must not break the sidebar).
- Accent color input is validated against a fixed palette of 12 accessible options; individual hex input remains behind "Custom" and must match `/^#[0-9a-fA-F]{6}$/`.
- Logo URL must be https and max ~100KB; on image load failure the widget/avatar falls back to initials.
- LLM framing failures already fall back to grounded answers; persona loss silently degrades to stock Ambassador — no new failure paths.

## Testing

- `scripts/e2e.mjs` gains a workspace-studio section: wizard writes persist, disabled module routes redirect, persona shows in Ambassador widget, quote HTML carries branding.
- Unit checks via existing `check-consistency.mjs` extended with the new module keys.
- Manual QA checklist in `PRODUCT-TOUR.md` gains a Workspace Studio section.

## Risks / mitigations

- **Sidebar rename breaks deep links** — renames only apply to labels; route paths never change.
- **Existing orgs see a blank Settings Studio panel** — profile defaults render stock values, so nothing breaks; setup completion flags stay false until changed.
- **Accent color contrast** — palette options are pre-validated for WCAG AA against white and dark text.
