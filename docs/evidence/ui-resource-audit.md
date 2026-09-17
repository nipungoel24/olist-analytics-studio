# UI Resource Audit — Phase 6

**Date**: 2026-09-13
**Scope**: External UI resources consulted, versions, findings, changes, conflicts

---

## emilkowalski/skills

### emil-design-eng
- **URL**: https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md
- **Revision**: main branch
- **Date accessed**: 2026-09-06, 2026-09-13
- **License**: MIT
- **Key findings**:
  - Animation decision framework: frequency → purpose → easing → speed
  - Never animate keyboard-initiated actions
  - UI animations under 300ms (project: under 200ms)
  - Review format: Before/After/Why markdown table
- **Changes applied**: Animation philosophy applied to Phase 6 UI review
- **Conflicts with project policy**: None — project is more restrictive (no decorative motion)

### review-animations
- **URL**: https://github.com/emilkowalski/skills/blob/main/skills/review-animations/SKILL.md
- **Revision**: main branch
- **Date accessed**: 2026-09-13
- **License**: MIT
- **Key findings**:
  - Ten non-negotiable standards (justified motion, frequency-appropriate, responsive easing, sub-300ms UI, origin/physicality, interruptibility, GPU-only, accessibility, asymmetric timing, cohesion)
  - Aggressive escalation triggers: `transition:all`, `scale(0)`, `ease-in`, keyboard-triggered animation, >300ms UI duration
  - Remedial hierarchy: delete → reduce → fix easing → fix origin → interruptible → GPU → asymmetric → polish
  - Findings format: Before/After/Why table
  - Verdict tiers: feel-breaking regressions, missed simplifications, performance, interruptibility, origin/physicality, accessibility
- **STANDARDS.md**: Full animation standards reference (easing curves, duration tables, springs, gestures, clip-path, performance, a11y)
- **Changes applied**: Animation review performed against Phase 6 UI
- **Result**: APPROVE — no feel-breaking regressions
- **Conflicts with project policy**: 
  - Skill recommends `ease-out` with custom cubic-bezier; project uses standard ease-out (simpler)
  - Skill allows springs for "alive" elements; project prohibits added JS animation dependencies
  - Skill recommends `scale(0.97)` button press feedback; project allows 120-180ms opacity/transform but doesn't require it

---

## ibelick/ui-skills

### baseline-ui
- **URL**: https://github.com/ibelick/ui-skills/blob/main/skills/baseline-ui/SKILL.md
- **Revision**: main branch
- **Date accessed**: 2026-09-06
- **License**: MIT
- **Key findings**:
  - Use Tailwind CSS defaults
  - Use `cn` utility (clsx + tailwind-merge) for class logic
  - `aria-label` on icon-only buttons
  - Animate only compositor props (transform, opacity)
  - Never exceed 200ms for interaction feedback
  - Respect `prefers-reduced-motion`
  - `tabular-nums` for data displays
  - Fixed z-index scale
- **Changes applied**: All applicable rules implemented in Phase 6
- **Conflicts with project policy**: None

### fixing-accessibility
- **URL**: https://github.com/ibelick/ui-skills/blob/main/skills/fixing-accessibility/SKILL.md
- **Revision**: main branch
- **Date accessed**: 2026-09-06
- **License**: MIT
- **Key findings**:
  - Every interactive control must have an accessible name
  - Icon-only buttons: `aria-label` or `aria-labelledby`
  - Keyboard: all interactive elements reachable by Tab, visible focus
  - Loading states: `aria-busy` or status text
- **Changes applied**: All applicable rules implemented in Phase 6
- **Conflicts with project policy**: None

### fixing-motion-performance
- **URL**: https://github.com/ibelick/ui-skills/blob/main/skills/fixing-motion-performance/SKILL.md
- **Revision**: main branch
- **Date accessed**: 2026-09-06
- **License**: MIT
- **Key findings**:
  - Never interleave layout reads and writes in same frame
  - Default to transform and opacity for motion
  - Keep blur animation small (≤8px), only for short one-time effects
  - Never animate large surfaces continuously
- **Changes applied**: All applicable rules implemented in Phase 6
- **Conflicts with project policy**: None

---

## Chart.js
- **URL**: https://www.chartjs.org/docs/latest/
- **npm packages**: `chart.js@4.5.1` + `react-chartjs-2@5.3.1`
- **License**: MIT
- **Key findings**: All controllers registered (Line, Bar, Doughnut, Scatter), animation disabled
- **Changes applied**: Chart.js is the only chart engine
- **Conflicts with project policy**: None

## Morphicons
- **URL**: https://www.morphicons.com/
- **npm package**: `morphicons@1.7.1`
- **License**: MIT
- **Key findings**: `reducedMotion="user"` respects OS preference
- **Changes applied**: Used for Pin/Refresh icons
- **Conflicts with project policy**: None — explicit small-icon exception

## @thesvg/icons
- **URL**: https://thesvg.org/
- **npm package**: `@thesvg/icons@3.3.3`
- **License**: MIT
- **Key findings**: PostgreSQL SVG available
- **Changes applied**: Used in AppShell footer
- **Conflicts with project policy**: None

## @radix-ui/react-tabs
- **URL**: https://www.radix-ui.com/primitives/docs/components/tabs
- **npm package**: `@radix-ui/react-tabs@1.1.21`
- **License**: MIT
- **Key findings**: Accessible tabs with keyboard navigation
- **Changes applied**: Wrapped in shadcn-style Tabs component
- **Conflicts with project policy**: None

## Tailwind CSS
- **URL**: https://tailwindcss.com/
- **npm package**: `tailwindcss@4.3.3`
- **License**: MIT
- **Key findings**: CSS-first config via @theme directive
- **Changes applied**: All design tokens mapped to Tailwind @theme
- **Conflicts with project policy**: None

## Inter Font
- **URL**: https://rsms.me/inter/
- **Version**: Inter v4.1 (local woff2 files)
- **License**: SIL Open Font License 1.1
- **Key findings**: Local serving, no CDN dependency
- **Changes applied**: 3 woff2 files in public/fonts/
- **Conflicts with project policy**: None — matches Design.md "locally served Inter"

## shadcn/ui
- **URL**: https://ui.shadcn.com/
- **CLI version**: Latest (verified 2026-09-16)
- **Style**: new-york
- **License**: MIT
- **Key findings**: Generated real shadcn primitives via CLI, not custom implementations
- **components.json**: `apps/web/components.json`
- **Dependencies**: class-variance-authority, tailwind-merge, clsx, lucide-react, @radix-ui/react-slot
- **Generated components**: Button, Textarea, Card, Tabs, Badge, Tooltip, Dialog, Table, Skeleton
- **Custom components**: Disclosure (project-custom, no shadcn equivalent)
- **Design token overrides**: Badge extended with `success` and `warning` variants
- **Changes applied**: All UI primitives now have genuine shadcn provenance
- **Conflicts with project policy**: None — Chart.js remains renderer, Recharts absent
