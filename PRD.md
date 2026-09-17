# PRD — Olist Analytics Studio

Status: proposed implementation baseline; no application has been built by this planning package.
Primary authority: supplied “Data Science Internship Assignment (1).pdf”, all six pages.

## 1. Product and audience
Build a local e-commerce analytics workspace where an analyst asks a plain-English question, receives a correct Chart.js chart with a one-sentence insight, and pins it to a persistent dashboard. Refresh must rerun the analysis on current imported data and explain significant changes.
Primary users: e-commerce analysts evaluating revenue, products, payments and fulfillment. Secondary users: operations managers reviewing saved analyses and internship evaluators inspecting the pipeline.
Success means correct, explainable analytics and reproducible startup. Frontend polish is a requested enhancement; it must not displace backend completeness.

## 2. Required scope
- Import the complete Olist CSV dataset into PostgreSQL during startup initialization.
- Expose a real MCP server using the official SDK, with validated analytics tools spanning all six domains in the brief.
- Provide ILLMAgent with native-tool-calling LLM and deterministic keyword fallback implementations.
- Configure selection with AGENT_MODE=llm|fallback. In llm mode automatically fall back for model unavailability or timeout; disclose the actual mode.
- Resolve natural-language filters consistently; show all assumptions.
- Compose results across tools using explicit keys and compatible cohorts.
- Select charts by data shape; return chart type and one-line justification.
- Give two appropriate chart options for genuinely ambiguous visualizations.
- Persist pinned charts, their original questions, resolved plans, snapshots and chosen visualizations.
- Refresh pins, compare data semantically, and surface changes without losing the prior result on failure.
- Handle unsupported questions, empty data, invalid tool arguments, timeouts and partial results.
- Supply docker compose up, committed .env.example, README, and an actual demo video with the prescribed five-query walkthrough.

## 3. Explicit scope limits
Single local workspace, no authentication, billing, multi-tenancy, chat-history retrieval, vector database, RAG, web search, live commerce integration, predictive modeling or text-to-arbitrary-SQL. No drag-and-drop dashboard requirement. Do not introduce Temporal from another project. Do not invent customer demographics, profit, SKU stock or causal conclusions.
An API key stays on the server. Queries obtain facts only from the imported database. Initial download and configured LLM inference are interpreted as exceptions to the brief's “no external API calls”; no external data enrichment is allowed. Record this interpretation in the submission.

## 4. Source ambiguities resolved
1. Eight core Olist tables plus category translation means nine CSV inputs. Inspect the actual archive rather than hardcoding the diagram's labels. The customer file is expected as olist_customers_dataset.csv, and orders link to customers using customer_id, not order_id. Validate the downloaded headers.
2. Standard chart rules apply in LLM mode. The brief explicitly overrides them in fallback mode: every successful fallback chart has Chart.js type bar. Unsupported/empty results still have no chart. A scatter question in fallback becomes a clearly labeled limited bar comparison; never claim it demonstrates correlation.
3. “Last year” is always 2017-01-01 through 2017-12-31 for this assignment; never use the machine's current year.
4. Review response time means review_answer_timestamp minus review_creation_date: a survey response interval, not seller support responsiveness.
5. Olist data is historical. Refreshing unchanged data should report no change. Demonstrate changed data using isolated test fixtures, clearly labeled, without altering the real source.
6. Dataset acquisition must be verified early. The final one-command path cannot secretly require Kaggle credentials, a manual unzip, or an untracked local CSV folder.

## 5. Filter rules
| Phrase | Resolution |
| --- | --- |
| last year | from 2017-01-01, to 2017-12-31 |
| first half of 2017 | from 2017-01-01, to 2017-06-30 |
| São Paulo | SP; seller_state for seller questions, customer_state for customer/delivery destination questions |
| top 10 | limit 10; descending by requested metric; stable ID tie-break |
| worst rated | ascending average review score; show reviewed-order count |
| electronics | resolve using the English side of category translation, then query the canonical category |
| no date range | full imported dataset; explicitly state this assumption |

Dates default to order_purchase_timestamp cohorts unless the user asks for another supported date field. Use start-inclusive and next-day-end-exclusive predicates. Reject inverted/invalid dates. Empty valid historical ranges are not validation errors. Missing metrics are null, not zero. Ambiguous business meaning prompts clarification; two chart options are only for visual ambiguity.

## 6. Business metric policy (proposed, apply consistently)
- Revenue: merchandise value SUM(item.price) in BRL, excluding freight, on delivered orders by purchase date. Label “delivered merchandise revenue”; it is not accounting net revenue or payment value.
- Order volume: COUNT(DISTINCT order_id), all statuses by default. Always expose status/cohort metadata. For cross-tool comparisons use the same requested cohort in both tools.
- Payment value: SUM(payment_value), delivered-order cohort by default. Share defaults to value share, not count of orders. Mixed payment orders can contribute to several types; installments never multiply payment_value.
- Average review score: one canonical review per order, deduplicated deterministically by latest answer timestamp, then creation date and a stable row tie-break. Category means count each order once per category. Seller means count each order once per seller. These scores are order-level proxies, not product-specific or seller-specific ratings.
- Delivery duration: delivered timestamp minus purchase timestamp in days for delivered orders with valid timestamps.
- Delay: actual delivery date minus estimated delivery date in calendar days; positive means late. On-time means actual date <= estimated date. Report denominator and excluded/missing count. Never mark undelivered orders as on time.
- Freight: SUM(item.freight_value) or mean freight per item as explicitly labeled.
- Review response interval: mean valid nonnegative survey interval in days; exclude invalid timestamps with count.
- Customer identity: use customer_unique_id for distinct people; customer_id is an order-linked record.
- Seller/customer zip codes remain strings. Geolocation must be reduced to one row per prefix before joining any aggregates.

## 7. Chart acceptance policy
| Data shape | LLM-mode result |
| --- | --- |
| One metric over time | line |
| Two metrics over time | line with named separate y axes when units differ |
| Top-N ranked metric | horizontal bar, descending |
| Worst-rated ranking | horizontal bar, ascending score; explicit ranking exception |
| Category comparison in one period | vertical bar |
| Payment composition | doughnut, displayed as “Donut” |
| Two continuous values per seller/entity | scatter, one point per entity |
| 1–5 score distribution | horizontal stacked bar; five score datasets, show counts and percentages |
| Ambiguous suitable shapes | two validated choices; pin the selected choice |

Mixed units such as state delay and score use aligned side-by-side charts with separate scales, or another explicitly justified safe option. Do not mix days and stars on a single shared scale.

## 8. Required question coverage
| ID | Question | Required execution and result |
| --- | --- | --- |
| Q1 | Show monthly revenue trend for 2017 | order trends; 12 ordered months; line |
| Q2 | Which product categories generate the most revenue? | category performance with translation; descending horizontal bar; disclose any display limit |
| Q3 | Which states have the worst delivery performance? | delivery by customer state; rank late rate descending; show cohort sizes |
| Q4 | What share of payments are credit card vs boleto? | payment tool; doughnut; include both and Other for all-method denominator |
| Q5 | Top 10 sellers by revenue in São Paulo | seller tool; seller_state=SP; descending revenue bar |
| Q6 | Show review score distribution for electronics | reviews joined through items/products/translation; 1–5 stacked horizontal bar |
| Q7 | Compare review scores across the top 5 categories by order volume | category tool ranks distinct orders, then review tool filters those category IDs; merge by category |
| Q8 | Show monthly orders and average review score together for 2017 | order and review tools, same cohort/month axis; dual-axis line |
| Q9 | Do sellers with faster delivery get better reviews? | delivery and review tools grouped by seller_id on matched valid delivered/reviewed-order cohort; scatter; association only |
| Q10 | Show delivery delay and review score side by side by state | delivery and review tools grouped by customer_state with matched cohort; separate days/stars views |

Q4 interpretation: original query is ambiguous between selected-method share and overall share. Default overall value shares with Other and disclose this. Explicit “among credit card and boleto only” uses the restricted denominator.

## 9. Guardrails and acceptance
Unsupported stocks/demographics -> clear message, chart=null. Valid empty filter -> no chart and filter explanation. One tool timeout -> preserve usable partial result plus failed source. If surviving rows cannot support a truthful chart, chart=null with a partial table. No fabricated replacement data or silently reduced question scope.
Every successful response includes question, actual agent mode, resolved filters, assumptions, metric units/cohort, tool provenance, data version, chart justification, insight and result ID. Non-success responses include a machine-readable status and useful next action.
Pins survive browser and container restart through a named database volume. Failed/partial refreshes preserve the last complete snapshot; partial refreshes are shown separately and are not called “no change.”
Definition of done: all ten questions exercised, meaningful numerical fixture assertions, actual native tool call verified with a real key, MCP protocol integration tested, fallback runs without a key, persisted refresh semantics tested, clean-machine compose startup verified, README and demo video delivered. If a key or external acquisition blocks verification, identify it; never label the corresponding gate passed.
