import os
import pytest
from processor import process_file

@pytest.mark.skipif(
    "DEEPSEEK_API_KEY" not in os.environ,
    reason="DEEPSEEK_API_KEY environment variable not set"
)
def test_process_file_structure():
    # Minimal test invoice CSV that should extract two line items
    csv_bytes = b"supplier,product,unit_price,quantity\nLocal Farm,Eggs,4.00,10\n"
    records = process_file(csv_bytes)
    assert isinstance(records, list)
    assert len(records) == 1
    rec = records[0]
    assert "title" in rec
    assert rec["title"] != "Unknown Supplier"
    assert rec["status"] == "unprocessed:info"
    assert isinstance(rec["details"], dict)
    assert "due_date" in rec
    # due_date might be None or a string
    if rec["due_date"] is not None:
        assert isinstance(rec["due_date"], str)
