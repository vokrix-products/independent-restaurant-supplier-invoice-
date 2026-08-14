import time, os, requests, json, uuid, sys, re, difflib
from datetime import datetime, date
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
PRODUCT_ID = os.environ["PRODUCT_ID"]
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
BREVO_API_KEY = os.environ.get("BREVO_API_KEY")
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "noreply@vokrix.com")
BREVO_SENDER_NAME = os.environ.get("BREVO_SENDER_NAME", "Vokrix")
DEFAULT_ALERT_EMAIL = os.environ.get("DEFAULT_ALERT_EMAIL")

MATCH_THRESHOLD = 0.55


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


# ---------- fuzzy ingredient / recipe matching ----------
def _tokens(s):
    return re.sub(r"[^a-z0-9 ]", " ", (s or "").lower()).split()


def _ratio(a, b):
    return difflib.SequenceMatcher(None, a, b).ratio()


def match_ingredient(description, sku, ingredients):
    """Best-effort fuzzy match of a line item to a recipe ingredient.
    Returns (ingredient_dict, score). Exact SKU match wins; otherwise
    string-similarity + token overlap against name and aliases."""
    best, best_score = None, 0.0
    desc_norm = " ".join(_tokens(description))
    desc_tokens = set(_tokens(description))
    for ing in ingredients or []:
        if sku and ing.get("sku") and str(sku).strip().lower() == str(ing["sku"]).strip().lower():
            return ing, 1.0
        names = [ing.get("ingredient_name", "")] + list(ing.get("aliases") or [])
        for name in names:
            name_norm = " ".join(_tokens(name))
            if not name_norm:
                continue
            score = _ratio(desc_norm, name_norm)
            overlap = len(desc_tokens & set(_tokens(name))) / max(1.0, len(set(_tokens(name))))
            combined = max(score, overlap)
            if combined > best_score:
                best_score = combined
                best = ing
    if best and best_score >= MATCH_THRESHOLD:
        return best, best_score
    return None, 0.0


def load_recipe_data():
    """Fetch recipes + ingredients for this product. Returns (recipes, by_recipe)."""
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/recipes",
            headers=HEADERS,
            params={"product_id": f"eq.{PRODUCT_ID}", "select": "id,name,description"},
        )
        if r.status_code != 200:
            print(f"[DIAG] recipes lookup status={r.status_code} body={r.text[:300]}")
            return [], {}
        recipes = r.json()
        r2 = requests.get(
            f"{SUPABASE_URL}/rest/v1/recipe_ingredients",
            headers=HEADERS,
            params={"select": "recipe_id,ingredient_name,aliases,sku,unit,quantity,expected_unit_price"},
        )
        if r2.status_code != 200:
            print(f"[DIAG] recipe_ingredients lookup status={r2.status_code} body={r2.text[:300]}")
            return recipes, {}
        ings = r2.json()
        by_recipe = {}
        for ing in ings:
            by_recipe.setdefault(ing["recipe_id"], []).append(ing)
        print(f"[DIAG] recipe data loaded: {len(recipes)} recipes, {len(ings)} ingredients")
        return recipes, by_recipe
    except Exception as e:
        print(f"load_recipe_data failed: {e}")
        return [], {}


def _to_float(v):
    try:
        f = float(v)
        return f if f == f else None  # NaN guard
    except (TypeError, ValueError):
        return None


# ---------- price variance (same-SKU + recipe baseline) ----------
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
        else:
            print(f"[DIAG] records lookup status={resp.status_code} body={resp.text[:200]}")
    return None, None


def classify_price(old_price, new_price, baseline=None):
    """Return (status, price_change_pct). Uses recipe baseline when no prior invoice price."""
    new = _to_float(new_price)
    if new is None:
        return "unprocessed:info", None
    old = _to_float(old_price)
    if old is None and baseline is not None:
        old = _to_float(baseline)
    if old is None or old <= 0:
        return "unprocessed:info", None
    pct = (new - old) / old * 100.0
    if pct >= 10.0:
        return "critical:critical", round(pct, 2)
    if pct >= 5.0:
        return "flagged:warning", round(pct, 2)
    return "valid:good", round(pct, 2)


# ---------- email alerts ----------
def send_price_alert(customer_email, alerts, recipe_impacts):
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
    html = f"<h3>Price increase detected on your recent invoice</h3><ul>{lines}</ul>"
    if recipe_impacts:
        rlines = "".join(
            f"<li><b>{r['recipe']}</b>: ${r['baseline_cost']:.2f} → ${r['new_cost']:.2f} "
            f"({r['pct']:+.1f}%, ${r['delta']:+.2f})</li>"
            for r in recipe_impacts
        )
        html += f"<h4>Recipe cost impact</h4><ul>{rlines}</ul>"
    payload = {
        "sender": {"email": BREVO_SENDER_EMAIL, "name": BREVO_SENDER_NAME},
        "to": [{"email": customer_email}],
        "subject": "⚠️ Supplier price / recipe cost increase detected",
        "htmlContent": html,
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
    """Resolve alert email: customers -> profiles -> env fallback."""
    for table in ("customers", "profiles"):
        try:
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/{table}",
                headers=HEADERS,
                params={"id": f"eq.{customer_id}", "select": "email", "limit": "1"},
            )
            if resp.status_code != 200:
                print(f"[DIAG] {table} lookup status={resp.status_code} body={resp.text[:300]}")
                continue
            rows = resp.json()
            if rows and rows[0].get("email"):
                return rows[0]["email"]
            if resp.status_code == 200 and not rows:
                print(f"[DIAG] {table} lookup OK but no row for {customer_id}")
        except Exception as e:
            print(f"[DIAG] {table} lookup exception: {e}")
    if DEFAULT_ALERT_EMAIL:
        return DEFAULT_ALERT_EMAIL
    return None


# ---------- main poll loop ----------
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
            requests.patch(
                f"{SUPABASE_URL}/rest/v1/jobs?id=eq.{job_id}",
                headers=HEADERS,
                json={"status": "processing", "started_at": datetime.utcnow().isoformat()},
            )
            try:
                file_bytes = download_file("uploads", input_file)
                results = processor.process_file(file_bytes)

                # load recipe baselines once per job
                recipes, by_recipe = load_recipe_data()
                flat_ingredients = []
                for rid, ings in by_recipe.items():
                    for ing in ings:
                        ing = dict(ing)
                        ing["recipe_id"] = rid
                        flat_ingredients.append(ing)
                recipe_name_by_id = {r["id"]: r["name"] for r in recipes}

                processed = []
                recipe_impacts = {}
                alerts = []
                for record in results:
                    details = dict(record.get("details", {}) or {})
                    sku = details.get("sku")
                    description = details.get("description")
                    new_price = details.get("unit_price")

                    old_price, _ = fetch_previous_price(sku, description)
                    ing, _score = match_ingredient(description, sku, flat_ingredients)
                    baseline = None
                    if old_price is None and ing and ing.get("expected_unit_price") is not None:
                        baseline = ing["expected_unit_price"]

                    status, pct = classify_price(old_price, new_price, baseline)
                    if status == "unprocessed:info":
                        if not sku and not description:
                            status = "missing:info"
                        elif ing is not None and ing.get("expected_unit_price") is None:
                            status = "needs_approval:review"

                    if old_price is not None and new_price is not None:
                        details["previous_unit_price"] = old_price
                        details["price_change_pct"] = pct

                    # recipe impact accumulation
                    rid = None
                    if ing is not None:
                        rid = ing["recipe_id"]
                        details["matched_ingredient"] = {
                            "name": ing.get("ingredient_name"),
                            "recipe_id": rid,
                            "sku": ing.get("sku"),
                            "expected_unit_price": ing.get("expected_unit_price"),
                        }
                        qty = _to_float(details.get("quantity")) or 0.0
                        up = _to_float(new_price) or 0.0
                        exp = _to_float(ing.get("expected_unit_price"))
                        if exp is not None and exp > 0 and qty > 0:
                            imp = recipe_impacts.setdefault(rid, {"baseline": 0.0, "new": 0.0, "items": []})
                            imp["baseline"] += qty * exp
                            imp["new"] += qty * up
                            imp["items"].append({"description": description, "sku": sku, "old": exp, "new": up})

                    # overdue invoice -> expired (unless price issue is more urgent)
                    due = record.get("due_date")
                    if due and status in ("valid:good", "unprocessed:info"):
                        try:
                            if date.fromisoformat(str(due)[:10]) < date.today():
                                status = "expired:info"
                        except Exception:
                            pass

                    if status in ("flagged:warning", "critical:critical"):
                        alerts.append({
                            "supplier": record.get("title", "Unknown"),
                            "sku": sku,
                            "description": description,
                            "old": old_price if old_price is not None else baseline,
                            "new": new_price,
                            "pct": pct or 0.0,
                        })

                    processed.append({
                        "title": record.get("title", "Untitled"),
                        "status": status or record.get("status", "unprocessed:info"),
                        "details": details,
                        "due_date": record.get("due_date"),
                        "rid": rid,
                    })

                # resolve per-recipe impact pct and attach to matching records
                impact_list = []
                for rid, imp in recipe_impacts.items():
                    if imp["baseline"] <= 0:
                        continue
                    imp["pct"] = round((imp["new"] - imp["baseline"]) / imp["baseline"] * 100.0, 2)
                    imp["delta"] = round(imp["new"] - imp["baseline"], 2)
                    imp["baseline_cost"] = round(imp["baseline"], 2)
                    imp["new_cost"] = round(imp["new"], 2)
                    imp["recipe"] = recipe_name_by_id.get(rid, "Unknown recipe")
                    impact_list.append(imp)

                for entry in processed:
                    if entry["rid"] and entry["rid"] in recipe_impacts:
                        imp = recipe_impacts[entry["rid"]]
                        entry["details"]["matched_recipe"] = imp["recipe"]
                        entry["details"]["recipe_impact_pct"] = imp["pct"]
                        entry["details"]["recipe_impact_delta"] = imp["delta"]

                for entry in processed:
                    record_payload = {
                        "product_id": PRODUCT_ID,
                        "customer_id": customer_id,
                        "title": entry["title"],
                        "status": entry["status"],
                        "details": entry["details"],
                        "source_file_path": input_file,
                        "due_date": entry["due_date"],
                    }
                    requests.post(
                        f"{SUPABASE_URL}/rest/v1/records",
                        headers=HEADERS,
                        json=record_payload,
                    )

                result_summary = f"Processed {len(processed)} records."
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
                if alerts:
                    customer_email = get_customer_email(customer_id)
                    send_price_alert(customer_email, alerts, impact_list)
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
