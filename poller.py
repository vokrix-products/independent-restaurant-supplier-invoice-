import time, os, requests, json, uuid, sys
from datetime import datetime
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
PRODUCT_ID = os.environ["PRODUCT_ID"]
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
BREVO_API_KEY = os.environ.get("BREVO_API_KEY")
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "noreply@vokrix.com")
BREVO_SENDER_NAME = os.environ.get("BREVO_SENDER_NAME", "Vokrix")

def download_file(bucket, file_path):
    if file_path.startswith(bucket + "/"):
        file_path = file_path[len(bucket) + 1:]
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{file_path}"
    resp = requests.get(url, headers={"Authorization": f"Bearer {SUPABASE_SERVICE_KEY}", "apikey": SUPABASE_SERVICE_KEY})
    resp.raise_for_status()
    return resp.content

try:
    import processor  # local module in same directory
except ImportError:
    sys.exit("processor.py not found")

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
}

def fetch_previous_price(sku, description):
    """Return (old_unit_price, created_at) of most recent prior record with same sku or description."""
    if not sku and not description:
        return None, None
    candidates = []
    if sku:
        candidates.append(("details->>sku", sku))
    if description:
        candidates.append(("details->>description", description))
    for field, val in candidates:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/records",
            headers=HEADERS,
            params={
                "product_id": f"eq.{PRODUCT_ID}",
                field: f"eq.{val}",
                "select": "details,created_at",
                "order": "created_at.desc",
                "limit": "1",
            },
        )
        if resp.status_code == 200:
            rows = resp.json()
            if rows:
                old = rows[0].get("details", {}).get("unit_price")
                if old is not None:
                    return old, rows[0].get("created_at")
    return None, None

def classify_price(old_price, new_price):
    """Return (status, price_change_pct)."""
    try:
        old = float(old_price)
        new = float(new_price)
    except (TypeError, ValueError):
        return "unprocessed:info", None
    if old <= 0:
        return "unprocessed:info", None
    pct = (new - old) / old * 100.0
    if pct >= 10.0:
        return "critical:critical", round(pct, 2)
    if pct >= 5.0:
        return "flagged:warning", round(pct, 2)
    return "valid:good", round(pct, 2)

def send_price_alert(customer_email, alerts):
    if not BREVO_API_KEY:
        print("BREVO_API_KEY not set — skipping email alert")
        return
    if not customer_email:
        print("No customer email — skipping email alert")
        return
    lines = "".join(
        f"<li><b>{a['supplier']}</b> — {a.get('description') or a.get('sku')} "
        f"{a['old']} → {a['new']} ({a['pct']:+.1f}%)</li>"
        for a in alerts
    )
    payload = {
        "sender": {"email": BREVO_SENDER_EMAIL, "name": BREVO_SENDER_NAME},
        "to": [{"email": customer_email}],
        "subject": "⚠️ Supplier price increase detected",
        "htmlContent": f"<h3>Price increase detected on your recent invoice</h3><ul>{lines}</ul>",
    }
    try:
        resp = requests.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"},
            json=payload,
        )
        print(f"Brevo alert status: {resp.status_code}")
    except Exception as e:
        print(f"Brevo alert failed: {e}")

def get_customer_email(customer_id):
    for table in ("profiles", "customers"):
        try:
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/{table}",
                headers=HEADERS,
                params={"id": f"eq.{customer_id}", "select": "email", "limit": "1"},
            )
            if resp.status_code == 200:
                rows = resp.json()
                if rows and rows[0].get("email"):
                    return rows[0]["email"]
        except Exception:
            continue
    return None

def poll():
    while True:
        try:
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/jobs",
                headers=HEADERS,
                params={
                    "status": "eq.pending",
                    "job_type": "eq.process_upload",
                    "product_id": f"eq.{PRODUCT_ID}",
                    "select": "*",
                    "order": "created_at.asc",
                    "limit": "1",
                },
            )
            resp.raise_for_status()
            jobs = resp.json()
            if not jobs:
                time.sleep(60)
                continue
            job = jobs[0]
            job_id = job["id"]
            customer_id = job["customer_id"]
            input_file = job["input_file_path"]
            print(f"Processing job {job_id}")
            # update status to processing
            requests.patch(
                f"{SUPABASE_URL}/rest/v1/jobs?id=eq.{job_id}",
                headers=HEADERS,
                json={"status": "processing", "started_at": datetime.utcnow().isoformat()},
            )
            try:
                file_bytes = download_file("uploads", input_file)
                results = processor.process_file(file_bytes)
                # write records to supabase with price variance
                alerts = []
                for record in results:
                    details = record.get("details", {}) or {}
                    sku = details.get("sku")
                    description = details.get("description")
                    new_price = details.get("unit_price")
                    old_price, _ = fetch_previous_price(sku, description)
                    status, pct = classify_price(old_price, new_price)
                    if old_price is not None and new_price is not None:
                        try:
                            details["previous_unit_price"] = old_price
                            details["price_change_pct"] = pct
                        except Exception:
                            pass
                    if status in ("flagged:warning", "critical:critical"):
                        alerts.append({
                            "supplier": record.get("title", "Unknown"),
                            "sku": sku,
                            "description": description,
                            "old": old_price,
                            "new": new_price,
                            "pct": pct or 0.0,
                        })
                    record_payload = {
                        "product_id": PRODUCT_ID,
                        "customer_id": customer_id,
                        "title": record.get("title", "Untitled"),
                        "status": status or record.get("status", "unprocessed:info"),
                        "details": details,
                        "source_file_path": input_file,
                        "due_date": record.get("due_date"),
                    }
                    requests.post(
                        f"{SUPABASE_URL}/rest/v1/records",
                        headers=HEADERS,
                        json=record_payload,
                    )
                result_summary = f"Processed {len(results)} records."
                # upload result summary (optional)
                result_filename = f"results/{job_id}.json"
                requests.post(
                    f"{SUPABASE_URL}/storage/v1/object/results/{result_filename}",
                    headers=HEADERS,
                    data=json.dumps(results, default=str).encode(),
                )
                requests.patch(
                    f"{SUPABASE_URL}/rest/v1/jobs?id=eq.{job_id}",
                    headers=HEADERS,
                    json={
                        "status": "completed",
                        "output_file_path": result_filename,
                        "result_summary": result_summary,
                        "completed_at": datetime.utcnow().isoformat(),
                    },
                )
                # send email alert if any flagged/critical
                if alerts:
                    customer_email = get_customer_email(customer_id)
                    send_price_alert(customer_email, alerts)
                # send notification
                try:
                    notif = {
                        "product_id": PRODUCT_ID,
                        "customer_id": customer_id,
                        "title": "Processing complete",
                        "body": "Your upload has been processed successfully.",
                        "type": "success",
                        "read": False,
                    }
                    requests.post(
                        f"{SUPABASE_URL}/rest/v1/notifications",
                        headers=HEADERS,
                        json=notif,
                    )
                except Exception:
                    pass
            except Exception as e:
                error_msg = str(e)
                print(f"Job {job_id} failed: {error_msg}")
                requests.patch(
                    f"{SUPABASE_URL}/rest/v1/jobs?id=eq.{job_id}",
                    headers=HEADERS,
                    json={
                        "status": "failed",
                        "result_summary": error_msg,
                        "completed_at": datetime.utcnow().isoformat(),
                    },
                )
                try:
                    notif = {
                        "product_id": PRODUCT_ID,
                        "customer_id": customer_id,
                        "title": "Processing failed",
                        "body": f"There was an error processing your upload: {error_msg}",
                        "type": "error",
                        "read": False,
                    }
                    requests.post(
                        f"{SUPABASE_URL}/rest/v1/notifications",
                        headers=HEADERS,
                        json=notif,
                    )
                except Exception:
                    pass
        except Exception as e:
            print(f"Polling error: {e}")
            time.sleep(60)

if __name__ == "__main__":
    print("Poller started")
    poll()
