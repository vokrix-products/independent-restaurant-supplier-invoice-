# Independent Restaurant Supplier Invoice → Recipe Cost Variance Auto-Alerter

**Know the moment a supplier price hike hits your recipes.** Upload supplier invoices and get instant alerts when ingredient costs drift from what your recipes expect — no inventory system, no POS integration required.

- **Live dashboard:** https://independent-restaurant-supplier-invoice.vokrix.co
- **Landing page:** https://vokrix.co/independent-restaurant-supplier-invoice-
- **Status:** active, accepting paid customers ($49/mo, 3 free uploads to try)

---

## What it does

1. **Upload** — restaurant owners drop in supplier invoice files (PDF, Excel, CSV, or plain text) via the dashboard's drag-and-drop upload card. Free tier = 3 uploads; after that, an Upgrade paywall triggers Stripe checkout.
2. **Extract** — `processor.py` sends the file bytes to the DeepSeek API and returns structured line-item records: supplier name, invoice number/date, due date, and per-line description, SKU, unit, quantity, unit price, extended total, GL category.
3. **Match** — `poller.py` matches each line item against the recipe database (`recipes` + `recipe_ingredients`) by supplier + ingredient description/SKU, and compares the invoiced unit price to the expected recipe cost baseline.
4. **Alert** — variances beyond the threshold are classified (Flagged / Critical) and an email alert is sent via Brevo (`send_price_alert`). All processing notifications are stored in `notifications`.
5. **Review** — the dashboard surfaces everything: variance table with color-coded severity, Matched Recipe + impact %, Top Price Movers card, Recent Activity, status breakdown.

## Record statuses (8)

| Status | Meaning |
|---|---|
| `Valid` | Price within recipe baseline (±5%) |
| `Price Flagged` | Price moved +5% to +15% vs baseline |
| `Price Critical` | Price moved > +15% vs baseline |
| `Missing Data` | Line item missing price/description needed for comparison |
| `Unprocessed` | Ingestion complete, poller hasn't analyzed it yet |
| `Expired` | `due_date` is in the past (payment deadline passed) |
| `Valid (decrease)` | Price moved below baseline (cost down) |
| `Flagged (decrease)` | Price dropped meaningfully (cost down) |

Primary entity: the **supplier** (`title` field). Every extraction starts as `unprocessed:info`; the poller marks it processed after variance analysis.

## Architecture

```
dashboard/   React + Vite + TanStack Router app (Vercel) — auth, upload, paywall, variance table
poller.py    Railway service — polls unprocessed records, matches recipes, classifies, sends Brevo alerts
processor.py DeepSeek extraction engine (PDF/XLSX/CSV/text → records)
backend/     Legacy copy of processor.py (kept for reference)
```

- **Dashboard:** https://independent-restaurant-supplier-invoice.vokrix.co (Vercel)
- **Poller/processor:** Railway service `243546a7-5b41-49cd-97dd-a5c63a1d441f` (Docker)
- **Database:** Supabase `llaorhwnbtppguvnkxzu` — tables: `records`, `jobs`, `recipes`, `recipe_ingredients`, `customers`, `notifications`, `profiles`

## Key tables

- `records` — extracted invoice line items (RLS: `customer_id = auth.uid()`). Fields: `title` (supplier), `status`, `details` (jsonb: invoice + line-item fields), `due_date` (ISO-8601 or null), `price_change_pct`, `matched_ingredient`, `matched_recipe`, `recipe_impact_pct`, `severity`.
- `recipes` / `recipe_ingredients` — the cost baselines (currently 9 recipes, 26 ingredients) used to compute variances.
- `jobs` — upload jobs with progress state.
- `customers` — customer → auth user mapping; **email is what alert emails are sent to**.
- `notifications` — processing + variance alert history.

## Dashboard features

- Supplier Price Variances table: search, status filter, resizable columns, full supplier names, Matched Recipe column, Price Change %, status badge, View drawer with full `details` JSON.
- Stats cards: Added This Week, Status Breakdown (bar chart).
- Recent Activity (ingest timeline) + Top Price Movers (largest |%| variances, color-coded, no 0.0% noise).
- Upload card: drag-drop + choose file, animated circular progress, 3-free-uploads meter, Upgrade → Stripe.
- **Load demo data / Clear demo** — one click fills the dashboard with a realistic sample invoice (8 line items, 3 suppliers, real recipe baselines) so new users see the full product instantly; Clear removes only demo rows (`source_file_path = 'demo://...'`), never the user's own uploads.
- Separate `/sign-in` (Send login code) and `/sign-up` (Start free trial) pages with Vercel-style email-exists detection (`user_exists` RPC).
- Paid accounts: `app_metadata.product_id = 'independent-restaurant-supplier-invoice-'` + `subscription_active = true` (set by Stripe webhook) — paywall hides, unlimited uploads.

## Environment variables

**Railway (poller):**
- `DEEPSEEK_API_KEY` — extraction LLM
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` — DB access
- `PRODUCT_ID` — `independent-restaurant-supplier-invoice-`
- `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` — alert email delivery (`jan@vokrix.net`)

**Vercel (dashboard):**
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_PRODUCT_ID`
- `VITE_STRIPE_PRICE_ID`, `VITE_STRIPE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_KEY` (server-side, upload API)

## Local development

```bash
# Backend (extraction + polling)
export DEEPSEEK_API_KEY="your-key"
pip install -r requirements.txt
python3 run_demo.py              # demo with hardcoded CSV invoice
pytest run_tests.py              # unit tests (requires API key)
python3 -c "from processor import process_file; ..."  # feed your own invoice bytes

# Dashboard
cd dashboard
npm install
cp .env.example .env             # fill Supabase/Vite vars
npm run dev
```

## Supported input formats

- PDF (via `pdfplumber`)
- Excel .xlsx (via `openpyxl`)
- CSV / plain text (UTF-8 fallback)
- DeepSeek extracts all line-item details (description, SKU, unit, qty, unit price, extended total)

## Pricing

- Free: 3 uploads (no card required)
- Paid: **$49/month** — unlimited uploads, all alert features (Stripe checkout, `VITE_STRIPE_PRICE_ID`)

## Support

- In-app Help + product assistant (dashboard)
- Landing FAQ: no POS/inventory needed; PDFs/scans supported; variance threshold defined by recipe cost baselines; fully hosted by Vokrix
