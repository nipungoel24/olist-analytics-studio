# Demo Script — Olist Analytics Studio

## Final Video Timestamps

**Video**: artifacts/submission/olist-analytics-demo.webm
**Format**: WebM (VP8/Opus)
**Size**: 5.1 MB
**Duration**: ~4:30
**Resolution**: 1440x900

---

### 00:00 — Opening App
- App loads at localhost:3000
- React 19 + Vite frontend initializes

### 00:05 — Navigate to Explore
- Click Explore navigation
- Query composer visible with textarea

### 00:10 — QUERY 1: Monthly Revenue 2017
- Question: "Show monthly revenue trend for 2017"
- Result: Monthly revenue data with line chart
- Insight: One-sentence summary
- **Pin action executed**

### 00:25 — QUERY 2: Payment Share
- Question: "What share of payments are credit card vs boleto?"
- Result: Payment composition breakdown
- Chart: Doughnut visualization
- **Pin action executed**

### 00:40 — QUERY 3: Top-5 Categories vs Reviews
- Question: "Compare review scores across the top 5 categories by order volume"
- Result: Category ranking with review scores
- Dependency: Top-5 categories by order volume
- Translated category names visible
- **Pin action executed**

### 00:55 — QUERY 4: Monthly Orders + Avg Review
- Question: "Show monthly orders and average review score together for 2017"
- Result: Dual-axis data with orders and review scores
- Chart: Combined visualization
- **Pin action executed**

### 01:10 — QUERY 5: Delivery vs Reviews
- Question: "Do sellers with faster delivery get better reviews?"
- Result: Paired seller data
- Chart: Scatter visualization
- Insight: Non-causal correlation noted
- **Pin action executed**

### 01:25 — Dashboard: Showing Pins
- Navigate to Dashboard
- Pin grid displays all 5 pinned analyses
- Refresh status visible for each pin

### 01:35 — Dashboard: Reload Persistence
- Browser page reloaded
- All pins persist after reload
- Data maintained in PostgreSQL

### 01:45 — Dashboard: Refresh Pin
- Click Refresh on first pin
- Previous chart displayed during refresh
- Refresh completes successfully
- Status shows unchanged (real data)

### 02:00 — Successful Fallback Analysis
- Navigate to Explore
- Question: "Show monthly revenue trend for 2017"
- **Fallback badge clearly visible**
- Mode: actualMode = fallback
- Result: Real data from MCP tools
- Chart: Bar visualization (fallback limitation)
- Insight: Generated from real data

### 02:20 — Unsupported Question
- Question: "What is the meaning of life?"
- Response: Unsupported message
- No chart shown (correct behavior)

### 02:35 — Partial Result Demo
- Navigate to partial demo server (port 3001)
- Question: "Compare review scores across the top 5 categories by order volume"
- **Partial badge visible (red/warning)**
- Warning: "Partial results — some data sources may be unavailable."
- Failed source: review_analysis (configured to fail)
- Successful sources: category_performance (data preserved)
- No chart for multi-tool partial (correct behavior)

### 02:50 — Recording Complete
- All required segments captured
- Video saved to artifacts/submission/

---

## Video Content Verification

| Check | Status |
|-------|--------|
| Q1 visible | ✅ |
| Q2 visible | ✅ |
| Q3 visible | ✅ |
| Q4 visible | ✅ |
| Q5 visible | ✅ |
| Correct order | ✅ |
| Dashboard | ✅ |
| Pin action | ✅ |
| Reload persistence | ✅ |
| Refresh action | ✅ |
| Fallback analysis | ✅ |
| Fallback mode visible | ✅ |
| Unsupported | ✅ |
| Partial result | ✅ |
| Failed source identified | ✅ |
| Successful data preserved | ✅ |
| Secrets visible | ❌ NONE |
