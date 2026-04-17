"""Directly test the PFM query against the database to find the 500 error."""
import sqlite3
import pandas as pd

DB = r"c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db"
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

USER_ID = 1

# 1. Test: COUNT query
try:
    total = conn.execute("SELECT COUNT(*) FROM pfm_snapshots WHERE user_id = ?", (USER_ID,)).fetchone()[0]
    print(f"1. pfm_snapshots count for user {USER_ID}: {total}")
except Exception as e:
    print(f"1. ERROR counting pfm_snapshots: {e}")

# 2. Test: List query
try:
    df = pd.read_sql_query(
        """SELECT id, snapshot_date, notes, total_assets,
               total_liabilities, net_worth, created_at
        FROM pfm_snapshots
        WHERE user_id = ?
        ORDER BY snapshot_date DESC
        LIMIT 100 OFFSET 0""",
        conn,
        params=(USER_ID,),
    )
    print(f"2. pfm_snapshots rows: {len(df)}")
    if not df.empty:
        print(f"   columns: {list(df.columns)}")
        print(f"   first row: {df.iloc[0].to_dict()}")
except Exception as e:
    print(f"2. ERROR querying pfm_snapshots: {e}")

# 3. Check table schemas
for table in ["pfm_snapshots", "pfm_assets", "pfm_liabilities", "pfm_income_expenses"]:
    try:
        cols = conn.execute(f"PRAGMA table_info({table})").fetchall()
        col_names = [c[1] for c in cols]
        print(f"\n3. {table} columns: {col_names}")
    except Exception as e:
        print(f"3. {table} ERROR: {e}")

# 4. If there are snapshots, test detail query
if total and total > 0:
    row = conn.execute("SELECT id FROM pfm_snapshots WHERE user_id = ? LIMIT 1", (USER_ID,)).fetchone()
    sid = row[0]
    print(f"\n4. Testing detail for snapshot_id={sid}")
    
    for table in ["pfm_assets", "pfm_liabilities", "pfm_income_expenses"]:
        try:
            cnt = conn.execute(f"SELECT COUNT(*) FROM {table} WHERE snapshot_id = ? AND user_id = ?", (sid, USER_ID)).fetchone()[0]
            print(f"   {table}: {cnt} rows")
        except Exception as e:
            print(f"   {table}: ERROR - {e}")

# 5. Check if query_df might fail
print("\n5. Checking pagination math:")
total_pages = max(1, (total + 100 - 1) // 100) if total else 1
print(f"   total={total}, total_pages={total_pages}")

conn.close()
