import time, os, requests, json, uuid, sys
from datetime import datetime
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
PRODUCT_ID = os.environ["PRODUCT_ID"]
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

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

def poll():
    while True:
        try:
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/jobs",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                },
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
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                },
                json={"status": "processing", "started_at": datetime.utcnow().isoformat()},
            )
            try:
                file_bytes = download_file("uploads", input_file)
                results = processor.process_file(file_bytes)
                # write records to supabase
                for record in results:
                    record_payload = {
                        "product_id": PRODUCT_ID,
                        "customer_id": customer_id,
                        "title": record.get("title", "Untitled"),
                        "status": record.get("status", "unprocessed:info"),
                        "details": record.get("details", {}),
                        "source_file_path": input_file,
                        "due_date": record.get("due_date"),
                    }
                    requests.post(
                        f"{SUPABASE_URL}/rest/v1/records",
                        headers={
                            "apikey": SUPABASE_SERVICE_KEY,
                            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                            "Content-Type": "application/json",
                        },
                        json=record_payload,
                    )
                result_summary = f"Processed {len(results)} records."
                # upload result summary (optional)
                result_filename = f"results/{job_id}.json"
                requests.post(
                    f"{SUPABASE_URL}/storage/v1/object/results/{result_filename}",
                    headers={
                        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                        "apikey": SUPABASE_SERVICE_KEY,
                    },
                    data=json.dumps(results, default=str).encode(),
                )
                requests.patch(
                    f"{SUPABASE_URL}/rest/v1/jobs?id=eq.{job_id}",
                    headers={
                        "apikey": SUPABASE_SERVICE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "status": "completed",
                        "output_file_path": result_filename,
                        "result_summary": result_summary,
                        "completed_at": datetime.utcnow().isoformat(),
                    },
                )
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
                        headers={
                            "apikey": SUPABASE_SERVICE_KEY,
                            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                            "Content-Type": "application/json",
                        },
                        json=notif,
                    )
                except Exception:
                    pass
            except Exception as e:
                error_msg = str(e)
                print(f"Job {job_id} failed: {error_msg}")
                requests.patch(
                    f"{SUPABASE_URL}/rest/v1/jobs?id=eq.{job_id}",
                    headers={
                        "apikey": SUPABASE_SERVICE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                        "Content-Type": "application/json",
                    },
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
                        headers={
                            "apikey": SUPABASE_SERVICE_KEY,
                            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                            "Content-Type": "application/json",
                        },
                        json=notif,
                    )
                except Exception:
                    pass
        except Exception as e:
            print(f"Polling error: {e}")
            time.sleep(60)
