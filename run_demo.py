"""
Hardcoded CSV invoice demo. Runs process_file and prints results.
No command-line arguments. Exits 0. Under 10 seconds.
"""
from processor import process_file

# realistic CSV content with multiple line items
csv_data = (
    b"supplier,product,unit_price,quantity\n"
    b"Acme Foods,Tomatoes,2.50,10\n"
    b"Acme Foods,Olive Oil,15.75,3\n"
)

def main():
    print("Starting demo extraction...")
    records = process_file(csv_data)
    print(f"Extracted {len(records)} record(s):")
    for i, rec in enumerate(records, 1):
        print(f"  Record {i}: title={rec['title']}, status={rec['status']}, due_date={rec['due_date']}")
        print(f"    Details: {rec['details']}")
    print("Demo complete.")
    assert isinstance(records, list)
    assert len(records) == 2  # expecting two line items

if __name__ == "__main__":
    main()
