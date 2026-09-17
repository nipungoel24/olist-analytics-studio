# Olist Analytics Studio

![TypeScript](https://img.shields.io/badge/TypeScript-7.0-blue)
![Tests](https://img.shields.io/badge/tests-365%20passing-brightgreen)
![Docker](https://img.shields.io/badge/Docker-ready-blue)

Local e-commerce analytics workspace where analysts ask plain-English questions, get Chart.js charts with one-sentence insights, and pin results to a persistent dashboard.

## Quick Start

```bash
# Clone and start everything
git clone <repo-url>
cd olist-analytics-blueprint
cp .env.example .env
docker compose up --build
```

The stack starts at **http://localhost:3000**. First run downloads the Olist Brazilian E-Commerce dataset from Kaggle (~44.7 MB) and imports it into PostgreSQL automatically.

## Architecture

```
Browser ──► Fastify API (port 3000) ──► ILLMAgent ──► MCP Client ──► MCP Server ──► PostgreSQL
                │                                              │
                ├─► Static React assets                       ├─► 7 analytics SQL tools
                └─► Pin/Analysis persistence                  └─► Read-only queries
```

**Monorepo** managed with pnpm workspaces and Docker Compose:

| Service | Role |
|---------|------|
| `db` | PostgreSQL 16 with persistent named volume |
| `init` | One-shot dataset downloader/importer (exits after success) |
| `api` | Fastify REST API + static frontend + supervised MCP child |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, TypeScript 7, Tailwind CSS v4, shadcn/ui |
| Charts | Chart.js 4.5.1, react-chartjs-2 |
| Icons | Morphicons 1.7.1, @thesvg/icons, Lucide |
| Backend | Fastify 5, TypeScript 7, Zod 4 |
| Database | PostgreSQL 16, pg 8 |
| LLM | Anthropic SDK 0.124 (Claude), native tool calling |
| MCP | @modelcontextprotocol/server + client v2 |
| Testing | Vitest 5 (unit + integration), Playwright 1.63 (E2E) |
| Tooling | pnpm 11, Docker Compose, Node.js >= 22 |

## MCP Analytics Tools

The MCP server exposes **7 validated SQL tools** through the official Model Context Protocol SDK:

| Tool | Description |
|------|-------------|
| `dataset_metadata` | Date extent, English category lookup, permitted dimensions, data version |
| `order_trends` | Monthly item revenue, distinct orders, delivery summary |
| `category_performance` | Revenue, distinct orders, freight, order-review proxy by product category |
| `seller_performance` | Revenue, order count, review proxy, delivery duration, location by seller |
| `review_analysis` | Score/category/month/seller/state distributions, counts, means, response intervals |
| `payment_breakdown` | Payment type/installments/month breakdowns with value and line counts |
| `geographic_analysis` | Delivery performance by customer/seller state, route analysis, delay metrics |

## Frontend Features

- **Explore Page** — Query composer with 4 sample suggestions, real-time results, chart type chooser
- **Dashboard** — Persistent pin grid with refresh lifecycle (idle → refreshing → unchanged/changed/not_comparable)
- **LLM Chat** — Ask questions in natural language; mode switches between native tool calling and deterministic fallback
- **Provider Switching** — `AGENT_MODE=llm` for Claude native tool calling, `AGENT_MODE=fallback` for keyword routing
- **Q7 Rerank** — Dynamic fan-out: top 5 categories are re-ranked fresh on each execution, not frozen IDs
- **Chart Options** — Ambiguous visualizations present two validated choices; pin stores the selection

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Liveness check |
| `GET` | `/api/ready` | DB + MCP child readiness |
| `POST` | `/api/analyses` | Submit question → AgentResult with analysis_id |
| `POST` | `/api/pins` | Pin an analysis to the dashboard |
| `GET` | `/api/pins` | List all pins with refresh status |
| `POST` | `/api/pins/:id/refresh` | Re-execute stored plan on current data |
| `DELETE` | `/api/pins/:id` | Remove a pin |

## Testing

```bash
# API unit tests (14 files, 146 tests)
pnpm --filter @olist/api test

# MCP unit tests (2 files, 15 tests)
pnpm --filter @olist/mcp test

# Integration tests (14 files, 174 tests)
npx vitest run --config tests/vitest.config.ts

# E2E browser tests (5 files, 30 tests)
npx playwright test --project=chromium

# Run all tests
pnpm test
```

**Total: 365 tests across 35 files.**

## Run Services Individually

```bash
# Frontend (dev server, port 5173)
pnpm dev:web

# API (with tsx watch)
pnpm dev:api

# MCP server (stdio, for debugging)
pnpm dev:mcp

# Build all packages
pnpm build

# Typecheck all packages
pnpm typecheck

# Lint all packages
pnpm lint
```

## Configuration

Copy `.env.example` to `.env` and customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://olist:olist_dev@localhost:5433/olist` | PostgreSQL connection string |
| `PORT` | `3000` | API server port |
| `AGENT_MODE` | `fallback` | `llm` for Claude, `fallback` for keyword routing |
| `ANTHROPIC_API_KEY` | — | Required only in `llm` mode |
| `LLM_MODEL` | `claude-sonnet-4-20250514` | Anthropic model ID |
| `ANALYSIS_TIMEOUT_MS` | `45000` | Overall analysis timeout |
| `MODEL_TIMEOUT_MS` | `25000` | LLM inference timeout |
| `TOOL_TIMEOUT_MS` | `5000` | Per-MCP-tool timeout |
| `FALLBACK_TIMEOUT_MS` | `10000` | Fallback agent budget |
| `MAX_MODEL_TURNS` | `4` | Max LLM conversation turns |
| `MAX_TOOL_CALLS` | `8` | Max tool invocations per analysis |
| `MAX_CHART_ROWS` | `500` | Maximum chart data points |
| `MAX_RANKED_DISPLAY` | `100` | Max ranked items returned |
| `DEFAULT_RANKED_DISPLAY` | `10` | Default top-N limit |
| `MAX_REQUEST_LENGTH` | `2000` | Max question character length |

## Project Structure

```
olist-analytics-blueprint/
├── apps/
│   ├── web/                    # React 19 + Vite + TypeScript frontend
│   │   ├── src/
│   │   │   ├── pages/          # ExplorePage, DashboardPage
│   │   │   ├── components/     # ChartCard, PinCard, UI primitives
│   │   │   ├── features/       # analysis, dashboard modules
│   │   │   └── styles/         # Tailwind v4 tokens, Inter font
│   │   └── e2e/                # Playwright browser tests
│   ├── api/                    # Fastify REST API
│   │   └── src/
│   │       ├── server.ts       # Fastify lifecycle
│   │       ├── routes/         # health, analyses, pins
│   │       ├── agents/         # ILLMAgent, native, fallback
│   │       ├── analysis/       # normalization, merge, charts, diff
│   │       ├── mcp/            # client, child process manager
│   │       └── repositories/   # analyses, pins, refresh persistence
│   └── mcp/                    # MCP analytics server
│       └── src/
│           ├── server.ts       # Protocol registration
│           ├── tools/          # 7 domain tool handlers
│           └── queries/        # Parameterized SQL
├── packages/
│   └── contracts/              # Zod schemas and inferred types
├── tests/
│   ├── fixtures/               # Synthetic Olist-shaped CSVs
│   ├── integration/            # Protocol, SQL, lifecycle tests
│   └── vitest.config.ts
├── migrations/                 # SQL schema migrations
├── docs/                       # Metric dictionary, demo scripts
├── compose.yaml                # Docker Compose stack
├── Dockerfile                  # Multi-stage: ingest, api
├── .env.example                # Configuration template
├── PRD.md                      # Product requirements
├── Architecture.md             # System design
├── Design.md                   # UI tokens and guidelines
└── Rules.md                    # Implementation constraints
```

## Dataset

The Olist Brazilian E-Commerce dataset is downloaded automatically on first `docker compose up` from Kaggle (anonymous HTTP, no credentials required). It contains 9 CSV files covering orders, customers, items, payments, reviews, products, sellers, and geolocation data across 2016–2018.

## License

MIT
