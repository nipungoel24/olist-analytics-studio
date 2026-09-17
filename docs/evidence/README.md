# Evidence Index

## Acceptance Criteria Evidence

| # | Criterion | Evidence |
|---|-----------|----------|
| Q1 | 7 SQL tools registered | apps/mcp/src/tools/ (7 files) |
| Q2 | Explore page functional | apps/web/e2e/phase5-api.spec.ts + phase5-dom.spec.ts |
| Q3 | Pin dashboard | apps/web/e2e/phase5-dom.spec.ts |
| Q4 | Refresh works | apps/web/src/components/PinCard.tsx + tests/integration/phase5-critical.test.ts |
| Q5 | Significant change detection | tests/integration/phase5-critical.test.ts (Q7 rerank) |
| Q6 | Fallback mode | .env.example (AGENT_MODE=fallback) |
| Q7 | Provider switching | apps/web/src/lib/api.ts (provider header) |
| Q8 | No secrets | Search: no hardcoded keys in apps/ |
| Q9 | 200% zoom | apps/web/e2e/zoom200.spec.ts (5 tests) |
| Q10 | Clean start | .env.example + compose.yaml |

## Documentation Files

- README.md — Project documentation
- docs/evidence/README.md — This file
- docs/evidence/acceptance-matrix.md — Q1-Q10 criteria
- docs/evidence/source-manifest.md — Licenses
- docs/requirements-matrix.md — Requirements-to-test mapping
