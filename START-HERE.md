# Start here

This folder is a planning and agent-handoff package for the supplied E-Commerce Sales Analytics Chatbot assignment. It contains no implemented application or dataset. Do not run docker compose up in this folder yet: the implementing agent will create that setup.

## Files
- PRD.md — required behavior, metric definitions, question coverage and acceptance.
- Architecture.md — stack, source layout, MCP/agent/API contracts, data joins and refresh logic.
- Rules.md — engineering boundaries, requested resource workflow and memory policy.
- Phases.md — detailed step-by-step implementation with approval gates.
- Design.md — exact visual system and component/interaction requirements.
- MasterPrompt.md — full prompt to paste into the coding agent.
- START-HERE.md — these instructions.
Memory.md is intentionally absent. The agent creates it after its first completed implementation/setup task and maintains it thereafter.

## Use with your agent
1. Extract this folder and open it in your coding editor/agent as the project workspace, or copy the five baseline documents into your intended repository root. Preserve existing files if this is an existing repository; have the agent compare before overwriting.
2. Add the original assignment PDF to the workspace, preferably under docs/assignment.pdf.
3. Open MasterPrompt.md and paste its complete contents into the agent's conversation. Ensure that the agent has read/write access to the folder and can inspect the linked official resources.
4. The prompt authorizes Phase 0 only. Review its requirement mapping, dataset feasibility and dependency decisions.
5. When satisfied, approve the completed phase and authorize the next. Repeat the gates in Phases.md.
6. If resuming in a new chat, tell the agent to read the five baseline files plus Memory.md, verify repository state, and continue the currently approved phase.

## What is confirmed versus proposed
Confirmed from the six-page assignment: historical Olist analytics; official MCP tools; two interchangeable agents; explicit date extraction; Chart.js shape rules; fallback bar-only exception; persistent pins/refresh diffs; one-command Docker startup; README and video.
Proposed engineering decisions: TypeScript/Fastify/Postgres/React/Vite stack, Anthropic provider adapter, precise revenue/status semantics, tool boundaries, change thresholds, local single-workspace scope and teal visual system. These are ready for Phase 0 review, not claims that the assignment mandated each choice.
Unverified until implementation: source archive access without extra credentials, actual CSV headers/row counts, compatible pinned versions, provider key/model availability, runtime performance and clean-machine startup. The plan makes these explicit gates.

## References inspected
Assignment PDF: all six pages extracted; schema diagram on page 2 visually inspected.
UI sources: Morphicons homepage/API example; theSVG homepage; ibelick/ui-skills repository and baseline-ui skill; emilkowalski/skills repository and emil-design-eng skill; shadcn homepage/Vite setup. Relevant instructions inform the plan; these packages/skills have not been installed into your coding agent by this handoff.
Technical sources: official MCP TypeScript SDK and server guide, native Claude tool-use overview, Chart.js mixed/scatter documentation and Docker Compose startup documentation. Links are included in Architecture.md and MasterPrompt.md.
Prepared 2026-09-06. No implementation, live dataset computation or application test results are claimed.
