# Design — Olist Analytics Studio

## Intent
A calm analytical workspace with a compact query composer and generous chart area. Use neutral surfaces, a restrained teal accent and highly legible numbers. The hierarchy is question -> chart -> factual insight -> assumptions/provenance. Avoid a marketing landing page, decorative KPI cards or a large greeting consuming the first screen.
These visual choices are proposed project decisions. The brief prioritizes the backend; visual refinement is Phase 6 after a working pipeline and dashboard.

## Theme tokens
| Token | Value | Role |
| --- | --- | --- |
| background | #F8FAFC | page |
| surface | #FFFFFF | chart/composer |
| foreground | #0F172A | titles/text |
| muted-foreground | #475569 | metadata |
| border | #CBD5E1 | separators |
| primary | #0F766E | main action/focus |
| primary-hover | #115E59 | pointer feedback |
| primary-foreground | #FFFFFF | button label |
| success | #166534 | confirmed state |
| warning | #92400E | partial/fallback/change |
| destructive | #B91C1C | failure/remove |

Light theme only for the assignment. Define CSS variables once, map shadcn tokens to them, and use semantic names. Verify actual contrast in all states; do not assume hex choices automatically satisfy every use.

Typography: locally served Inter with system-ui fallback; no runtime Google Fonts dependency. Body 14px/20px on desktop, composer input at least 16px; page title 24px/32px semibold, result title 18px/26px semibold, metadata 12px/18px, data table 13px/20px with tabular numerals. Use sentence case and standard letter spacing. No giant display font or all-caps paragraph text.
Spacing: 4px base; 8, 12, 16, 24, 32px intervals. Cards radius 12px; controls 8px. Small shadow only for raised overlays. Content max width 1440px; desktop padding 24px, mobile 16px. Standard controls at least 40px high; primary touch targets 44px. Maintain clearly visible 2px focus ring with offset.

## Screens and behavior
Explore: top navigation with product name, Explore and Dashboard tabs. Compact historical-dataset label. Query composer uses a multiline field, visible submit button and four real sample-query suggestions. Never show fabricated answered charts on first load. Empty state invites one question.
Result card: question/title, actual mode and partial badges, chart, one-sentence insight, explicit assumptions, chart-type explanation, table toggle, Pin action. Expandable “How this was calculated” includes metrics, tool names, filters, dataset version and warnings; never expose private model reasoning. On ambiguous shape, show two option buttons that change the visualization while preserving data.
Dashboard: responsive two-column card grid on wide screens and single column on narrow screens. Each card includes title, chart, insight, last successful refresh, refresh action and remove action. Keep existing chart visible during refresh. Show failed refresh beside the relevant card. Changed state opens a factual old/new difference table. “No significant change” and “Could not compare” are distinct.
About: unobtrusive dialog/footer with dataset attribution, historical coverage and a small honest technology row using appropriately sourced theSVG brand marks. It is not a fake integrations screen.

## Charts
Chart.js is the only chart engine. Do not use shadcn's default chart renderer if it introduces Recharts. Build ChartCard around Chart.js plus shadcn Card, Tabs, Tooltip and table primitives.
Reserve at least 300px chart height on desktop and 260px on mobile. Allow ranked chart height to grow with labels; wrap or expose full category names. Axes show units (BRL, days, orders, stars, %), and rating axes show the 1–5 domain where appropriate. Bar magnitude axes start at zero. Two units get separate labeled axes/panels. No 3D, gradients or smoothed curves that suggest observations not present.
Series palette: #0F766E, #2563EB, #B45309, #7C3AED, #BE123C. This is a categorical data palette, not five UI accents. Reinforce series identity with labels/line dashes; do not rely on color alone. Score stacks use ordered labeled segments 1 to 5, tooltips showing counts and shares. Accessible data table and textual insight accompany every chart canvas.

## Components and icon sources
Generate only needed shadcn components: Button, Textarea, Card, Tabs, Badge, Tooltip, Dialog/AlertDialog, Table, Skeleton and selected disclosure primitives. Use consistent keyboard/focus primitives from the chosen shadcn setup.
Use Morphicons for Pin -> confirmed pinned state and optional Refresh -> completed state after real backend success. Static error state is sufficient. Icon sizes 16px for inline controls, 20px primary controls with a consistent stroke. Screen-reader names describe actions; visible text carries state, not just animation. Reduced motion replaces morphing with immediate end-state icons.
Source suitable brand SVGs from https://thesvg.org/ for About. Review paths and sanitize files before placing them in public/brands. Do not recolor brand artwork unless its terms allow. Maintain a source/license ledger.

## Skills applied to this project
Read the actual baseline-ui skill from https://github.com/ibelick/ui-skills and emil-design-eng from https://github.com/emilkowalski/skills. Use their relevant guidance to review accessible controls, responsive state feedback and animation restraint. The project resolves their conflicts in Rules.md. This document does not imply that either repository is installed in the user's agent.
Project motion budget: immediate keyboard navigation and data updates; 120–180ms opacity/transform feedback only where useful; no staggered chart entrances, animated counters, parallax, blur, glass surfaces or looping decorative motion. Morphicons is the explicit small-icon exception. No added JavaScript animation dependency unless a required interaction cannot be handled by CSS/Morphicons; then inspect the selected skill's current guidance.

## UI acceptance checklist
At 390px, 768px and 1440px: no page overflow, composer remains usable, chart legends/labels readable and actions reachable. Test actual long category names and ten sellers. Keyboard can submit, choose a chart, pin, navigate, refresh and remove; focus returns correctly from dialogs. Loading never pretends completion. Test unknown query, empty result, invalid input, fallback, partial results, full failure, successful pin, pin failure and failed refresh. Review motion with reduced-motion enabled. Never trade data correctness for a prettier chart.
