import sqlite3

db_paths = [
    r"c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\backend-api\portfolio.db",
    r"c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\backend-api\app\portfolio.db",
]

for dbpath in db_paths:
    try:
        conn = sqlite3.connect(dbpath)
        cur = conn.cursor()
        tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'pfm%'").fetchall()]
        print(f"{dbpath}:")
        print(f"  pfm tables = {tables}")
        
        # Check what tables the route expects
        expected = ["pfm_snapshots", "pfm_assets", "pfm_liabilities", "pfm_income_expenses"]
        for t in expected:
            exists = t in tables
            print(f"  {t}: {'EXISTS' if exists else 'MISSING'}")
            if exists:
                # Check row count
                count = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                print(f"    rows: {count}")
        conn.close()
    except Exception as e:
        print(f"{dbpath}: ERROR - {e}")
    print()
