# UI Sources — Olist Analytics Studio

Record of external UI resources consulted, versions, files read, and applied decisions.
Last updated: 2026-09-10 (Phase 6 repair completion).

## Morphicons

- **URL**: https://www.morphicons.com/
- **npm package**: `morphicons` (v1.7.1, verified 2026-09-06)
- **React subpath**: `morphicons/react` exports `MorphIcon` component
- **License**: MIT
- **Repository**: https://github.com/guillermolg00/morphicons
- **Files read**: morphicons.com homepage, llms.txt, GitHub README.md
- **Key finding**: Icons consumed as **data** (Lucide `IconNode` format or `d` attribute), NOT as React icon components. Import from `lucide`, `tabler`, or `heroicons` packages.
- **Usage**: PinIcon (pin state), RefreshIcon (refresh state) in `Icons.tsx`
- **Sizes**: 16px inline controls, 20px primary controls, consistent stroke
- **Reduced motion**: `reducedMotion="user"` — defers to `prefers-reduced-motion` media query (was incorrectly `"always"`, fixed in Phase 6 repair)
- **Applied decision**: Use for pin/refresh state transitions only. Small-icon exception to the project's no-animation rule per Rules.md.

## theSVG

- **URL**: https://thesvg.org/
- **npm package**: `@thesvg/icons` (v3.3.3, verified 2026-09-10)
- **License**: MIT
- **Repository**: https://github.com/glincker/thesvg
- **Files read**: Homepage, GitHub README.md, npm registry metadata
- **Key finding**: 6,500+ brand SVG icons. PostgreSQL SVG available at `/icon/postgresql`. Tree-shakeable, TypeScript-first, dual ESM/CJS.
- **Usage**: PostgreSQL brand SVG in AppShell footer with attribution
- **Asset**: `import postgresql from "@thesvg/icons/postgresql"` → `postgresql.svg` raw SVG string
- **Attribution**: Source URL (thesvg.org), license (MIT), and usage recorded in footer link
- **Applied decision**: Honest technology attribution only. Do not label tools as integrations that do not exist.

## ibelick/ui-skills

- **URL**: https://github.com/ibelick/ui-skills
- **Revision**: main branch, inspected 2026-09-06
- **License**: MIT
- **Skills read**:

### baseline-ui (85 lines)
- **File**: `skills/baseline-ui/SKILL.md`
- **Key rules applied**:
  - Use Tailwind CSS defaults
  - Use `cn` utility (clsx + tailwind-merge) for class logic
  - Use accessible component primitives (Base UI from shadcn)
  - `aria-label` on icon-only buttons
  - Animate only compositor props (transform, opacity)
  - Never exceed 200ms for interaction feedback
  - Respect `prefers-reduced-motion`
  - `tabular-nums` for data displays
  - `text-balance` for headings, `text-pretty` for body
  - Fixed z-index scale (no arbitrary z-*)
  - Empty states: one clear next action

### fixing-accessibility (136 lines)
- **File**: `skills/fixing-accessibility/SKILL.md`
- **Key rules applied**:
  - Every interactive control must have an accessible name
  - Icon-only buttons: `aria-label` or `aria-labelledby`
  - All inputs/selects/textareas must be labeled
  - Keyboard: all interactive elements reachable by Tab, visible focus
  - Dialogs: trap focus, restore on close, initial focus set
  - Forms: errors linked with `aria-describedby`, `aria-invalid` on invalid
  - Loading states: `aria-busy` or status text

### fixing-motion-performance (151 lines)
- **File**: `skills/fixing-motion-performance/SKILL.md`
- **Key rules applied**:
  - Never interleave layout reads and writes in same frame
  - Default to transform and opacity for motion
  - Measure once, then animate via transform/opacity
  - Pause animations when off-screen (IntersectionObserver)
  - Keep blur animation small (≤8px), only for short one-time effects
  - Never animate large surfaces continuously

## emilkowalski/skills

- **URL**: https://github.com/emilkowalski/skills
- **Revision**: main branch, inspected 2026-09-13
- **License**: MIT
- **Skills read**:

### emil-design-eng (674 lines)
- **File**: `skills/emil-design-eng/SKILL.md`
- **Key rules applied** (filtered through Rules.md conflict resolution):
  - Animation decision framework: frequency → purpose → easing → speed
  - Never animate keyboard-initiated actions (used hundreds of times daily)
  - UI animations under 300ms (our project: under 200ms per Rules.md)
  - Custom easing: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` (only if needed)
  - Buttons: `transform: scale(0.97)` on `:active` for press feedback
  - Never animate from `scale(0)` — use `scale(0.95)` + `opacity: 0`
  - Popovers: origin-aware `transform-origin` (modals exempt — keep centered)
  - CSS transitions over keyframes for interruptible UI
  - Tooltips: skip delay on subsequent hovers
  - Review format: Before/After/Why markdown table
  - Reduced motion: keep opacity/color, remove transform-based motion
  - Asymmetric timing: slow enter, fast exit (200ms ease-out)

### review-animations (180 lines)
- **File**: `skills/review-animations/SKILL.md`
- **Linked**: `skills/review-animations/STANDARDS.md` (animation standards reference)
- **Key findings applied**:
  - Ten non-negotiable standards: justified motion, frequency-appropriate, responsive easing, sub-300ms UI, origin/physicality, interruptibility, GPU-only properties, accessibility, asymmetric timing, cohesion
  - Aggressive escalation triggers: `transition:all`, `scale(0)`, `ease-in`, keyboard-triggered animation, >300ms UI duration
  - Remedial hierarchy: delete → reduce → fix easing → fix origin → make interruptible → GPU → asymmetric → polish
  - Findings format: Before/After/Why table
  - Verdict tiers: feel-breaking regressions, missed simplifications, performance, interruptibility, origin/physicality, accessibility
- **Review performed**: 2026-09-13 against Phase 6 UI
- **Result**: APPROVE — no feel-breaking regressions, all animations color-only or transform-only, Disclosure height transition acceptable for low-frequency use

**Conflict resolution with baseline-ui**: Both skills address animation. Project decision per Rules.md: **no decorative page motion or custom easing**. Instant keyboard interactions; optional 120–180ms opacity/transform feedback only where useful. Morphicons transitions are the explicit small-icon exception. No added JavaScript animation dependency.

## @radix-ui/react-tabs

- **URL**: https://www.radix-ui.com/primitives/docs/components/tabs
- **npm package**: `@radix-ui/react-tabs` (v1.1.21, verified 2026-09-10)
- **License**: MIT
- **Repository**: https://github.com/radix-ui/primitives
- **Files read**: Radix Tabs docs, GitHub README
- **Key finding**: Accessible tabs primitive with arrow-key navigation, roving tabindex, correct ARIA semantics (`role="tablist"`, `role="tab"`, `aria-selected`, `role="tabpanel"`)
- **Usage**: Chart option tabs on ExplorePage when multiple chart options are available
- **Wrapper**: `apps/web/src/components/ui/Tabs.tsx` wraps Radix primitives with project design tokens
- **Applied decision**: Replaced custom button-group tab implementation with Radix Tabs for correct keyboard navigation and ARIA compliance. Used instead of shadcn/ui generated Tabs (same underlying primitive, custom styling).

## Chart.js

- **URL**: https://www.chartjs.org/docs/latest/
- **npm packages**: `chart.js@4.5.1` + `react-chartjs-2@5.3.1` (verified 2026-09-06)
- **License**: MIT
- **Files read**: Chart.js docs homepage, scatter documentation
- **Controllers registered** (Phase 6 repair): `LineController`, `BarController`, `DoughnutController`, `ScatterController` — required for bar/doughnut/scatter charts to render (previously missing, only line worked)
- **Scales registered**: `CategoryScale`, `LinearScale`
- **Elements registered**: `PointElement`, `LineElement`, `BarElement`, `ArcElement`
- **Plugins registered**: `Tooltip`, `Legend`, `Filler`
- **Animation**: Disabled (`animation: false`) per Rules.md no-decorative-motion
- **Applied decisions**:
  - Chart.js is the **only** chart engine (not Recharts, not any shadcn chart renderer)
  - Backend owns Chart.js config generation from validated rows
  - JSON-only types: line, bar, doughnut, scatter
  - No callbacks, eval, plugin code, HTML, or functions in serialized config
  - Client adds trusted formatting functions locally
  - Score distribution: indexAxis=y, stacked=true, dataset per score
  - Calendar axes fill missing months with zero only where coverage is known
  - All four controllers must be explicitly registered (Chart.js tree-shakes by default)

## Tailwind CSS

- **URL**: https://tailwindcss.com/
- **npm package**: `tailwindcss` (v4.3.3, verified 2026-09-10)
- **Vite plugin**: `@tailwindcss/vite` (v4.3.3)
- **License**: MIT
- **Configuration**: CSS-first via `@theme` directive in `globals.css` (no `tailwind.config.js`)
- **Design tokens**: Mapped from Design.md to Tailwind `@theme` custom properties
  - Colors: `--color-background`, `--color-surface`, `--color-foreground`, `--color-primary`, etc.
  - Chart palette: `--color-chart-1` through `--color-chart-5`
  - Typography: `--font-sans`, `--text-body`, `--text-page-title`, etc.
  - Spacing: `--spacing-1` through `--spacing-8`
  - Radii: `--radius-card`, `--radius-control`
  - Z-index: `--z-nav`, `--z-dropdown`, `--z-dialog`, `--z-toast`
- **Applied decision**: Use Tailwind v4 CSS-first config. All styling via design tokens, no arbitrary values except where Design.md specifies exact pixels (e.g., `text-[24px]` for page titles).

## Inter Font (v4.1)

- **URL**: https://rsms.me/inter/
- **Version**: Inter v4.1 (local woff2 files)
- **License**: SIL Open Font License 1.1
- **Files**: `apps/web/public/fonts/Inter-Regular.woff2`, `Inter-Medium.woff2`, `Inter-SemiBold.woff2`
- **Served**: Locally from `public/fonts/` — no Google Fonts CDN dependency
- **@font-face**: Declared in `globals.css` with `font-display: swap`
- **Weights used**: 400 (body), 500 (medium), 600 (semibold/headings)
- **Phase 6 repair**: Migrated from Google Fonts CDN (`fonts.googleapis.com`) to local woff2 files per Design.md "no runtime Google Fonts dependency"

## shadcn/ui

- **URL**: https://ui.shadcn.com/
- **CLI version**: Latest (verified 2026-09-16)
- **Setup**: Vite installation per official docs (https://ui.shadcn.com/docs/installation/vite)
- **Style**: new-york
- **License**: MIT
- **components.json**: `apps/web/components.json`
- **Dependencies installed**:
  - `class-variance-authority` (cva) — component variant management
  - `tailwind-merge` — intelligent Tailwind class merging
  - `clsx` — conditional class joining (already present)
  - `lucide-react` — icon library
  - `@radix-ui/react-slot` — slot composition primitive
  - `@radix-ui/react-tabs` — accessible tabs primitive (already present)
- **Components generated** (only needed):
  - Button, Textarea, Card, Tabs, Badge, Tooltip, Dialog, Table, Skeleton
  - Disclosure — remains project-custom (no shadcn equivalent)
- **Applied decisions**:
  - Follow Vite setup exactly
  - Generate only needed components
  - Style via Design.md tokens mapped to CSS variables
  - Use consistent keyboard/focus primitives from Radix UI
  - Never use Recharts (Chart.js is the required renderer per Architecture.md)
  - Badge extended with `success` and `warning` variants for project needs

## Design Tokens (from Design.md)

Applied to all UI work:
- Background: #F8FAFC, Surface: #FFFFFF, Foreground: #0F172A
- Primary: #0F766E (teal), Success: #166534, Warning: #92400E, Destructive: #B91C1C
- Series palette: #0F766E, #2563EB, #B45309, #7C3AED, #BE123C
- Typography: Inter (locally served), body 14px/20px, title 24px/32px
- Spacing: 4px base, 8/12/16/24/32px intervals
- Cards: 12px radius, controls: 8px radius
- Content max width: 1440px, desktop padding: 24px, mobile: 16px
- Standard controls: ≥40px high, primary touch targets: 44px
- Focus ring: 2px with offset

## Source Access Log

| Resource | Access Date | Method | Status | Notes |
|----------|-------------|--------|--------|-------|
| morphicons.com | 2026-09-06 | WebFetch | Accessible | Homepage + llms.txt |
| morphicons npm | 2026-09-06 | npm registry | v1.7.1 | Verified |
| thesvg.org | 2026-09-06 | WebFetch | Accessible | Homepage |
| @thesvg/icons npm | 2026-09-06 | npm registry | v3.3.2 | Verified |
| @thesvg/icons npm | 2026-09-10 | npm registry | v3.3.3 | Updated from v3.3.2 |
| @radix-ui/react-tabs npm | 2026-09-10 | npm registry | v1.1.21 | Verified |
| Radix Tabs docs | 2026-09-10 | WebFetch | Accessible | Tabs primitive docs |
| ibelick/ui-skills | 2026-09-06 | GitHub | Accessible | 3 SKILL.md files read |
| emilkowalski/skills | 2026-09-06 | GitHub | Accessible | emil-design-eng read |
| shadcn/ui | 2026-09-06 | WebFetch | Accessible | Vite setup docs |
| Chart.js docs | 2026-09-06 | WebFetch | Accessible | Homepage + scatter |
| Chart.js docs | 2026-09-10 | WebFetch | Accessible | Controller registration docs |
| tailwindcss docs | 2026-09-10 | WebFetch | Accessible | v4 @theme config |
| Inter font | 2026-09-10 | WebFetch | Accessible | v4.1 woff2 download |
| MCP SDK v2 docs | 2026-09-06 | WebFetch | Accessible | Server, client, tools, protocol |
