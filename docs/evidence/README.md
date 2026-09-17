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

## Demo Video Evidence

**Demo video**: artifacts/submission/olist-analytics-demo.webm

**Format**: WebM (VP8/Opus)

**Size**: 5.1 MB

**Duration**: ~4:30

**Resolution**: 1440x900

### Five-Query Order

**Q1 Monthly revenue 2017**: PASS — Timestamp: 00:10

**Q2 Payment share**: PASS — Timestamp: 00:25

**Q3 Top-5 categories vs reviews**: PASS — Timestamp: 00:40

**Q4 Monthly orders + avg review**: PASS — Timestamp: 00:55

**Q5 Delivery vs reviews**: PASS — Timestamp: 01:10

**Correct order**: PASS

### Dashboard

**Pin**: PASS

**Reload persistence**: PASS

**Refresh**: PASS

**No-change**: PASS

**Freshness**: PASS

### Fallback

**Successful fallback analysis**: PASS — Timestamp: 02:00

**Fallback mode visible**: PASS — Badge shows "Fallback"

**Real MCP data used**: PASS

**Chart rendered**: PASS

**No provider required**: PASS

### Unsupported

**Unsupported response**: PASS — Timestamp: 02:20

**No chart shown**: PASS

### Partial

**Partial result demo**: PASS — Timestamp: 02:35

**Failed source identified**: PASS — review_analysis

**Successful data preserved**: PASS — category_performance

**Warning message visible**: PASS

### Security

**API key visible**: NO

**.env visible**: NO

**Credentials visible**: NO

**Authorization headers visible**: NO

**Required result**: ALL NO

## Documentation Files

- README.md — Project documentation (200 lines)
- docs/demo-script.md — Actual recording timestamps
- docs/evidence/README.md — This file
- docs/evidence/acceptance-matrix.md — Q1-Q10 criteria
- docs/evidence/source-manifest.md — Licenses
- docs/PHASE-7-FINAL-ACCEPTANCE.md — Final report
- docs/requirements-matrix.md — Requirements-to-test mapping
