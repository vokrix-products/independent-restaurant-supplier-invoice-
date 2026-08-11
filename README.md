# Independent Restaurant Supplier Invoice → Recipe Cost Variance Auto-Alerter

## Product
A lightweight backend service (SMB tier, non-MarginEdge) that extracts supplier invoice data — including line-item details — from PDF, Excel, CSV, or plain-text files using the DeepSeek API. The extracted records are structured for a downstream poller that flags recipe cost variances automatically.

## Archetype
- **Primary entity**: The supplier (vendor). The `title` field of every record is the supplier name.
- **Record status**: Every extraction starts as `unprocessed:info`, signaling to the poller that the record has been ingested but not yet processed.
- **Key dates**: `due_date` is normalized to ISO-8601 (YYYY-MM-DD), or `None` if missing.

## What the Poller Expects as Input
`process_file(file_bytes)` returns a list of records. Each record is a dictionary:

```python
{
    "title": "Supplier Name",          # primary entity
    "status": "unprocessed:info",      # always set on extraction
    "details": {
        "invoice_number": "INV-12345",
        "invoice_date": "2025-01-15",
        "remit_address": "...",
        "payment_terms": "Net 30",
        "purchase_order": "PO-98765",
        "location": "Store 1",
        "currency": "USD",
        "tax_amount": 10.0,
        "freight_shipping": 5.0,
        "invoice_total": 120.0,
        # line-item fields merged below:
        "description": "Tomatoes",
        "sku": "SKU123",
        "unit": "kg",
        "quantity": 10.0,
        "unit_price": 2.5,
        "extended_total": 25.0,
        "discounts_allowances": 0.0,
        "gl_category": "Food"
    },
    "due_date": "2025-02-14"  # ISO-8601 or None
}
```

The poller should:
1. Read records with `status == "unprocessed:info"`.
2. Match `title` (supplier) and `details.description` / `details.sku` against recipe ingredient costs.
3. Compare invoice unit prices against expected recipe costs.
4. Mark records processed after variance alerts are emitted.

## Setup

Set `DEEPSEEK_API_KEY` environment variable before running.

```bash
export DEEPSEEK_API_KEY="your-key"
pip install -r requirements.txt
```

## Usage
- `python3 run_demo.py` — quick demo with hardcoded CSV invoice.
- `pytest run_tests.py` — run unit tests (requires API key).
- `python3 -c "from processor import process_file; ..."` — feed your own invoice bytes.

## Supported Input Formats
- PDF (via `pdfplumber`)
- Excel .xlsx (via `openpyxl`)
- CSV / plain text (UTF-8 fallback)
Dashboard: https://independent-restaurant-supplier-invoice-.vokrix.co
Vercel: independent-restaurant-supplier-invoice-
Railway: 243546a7-5b41-49cd-97dd-a5c63a1d441f
Railway: independent-restaurant-supplier-invoice-
