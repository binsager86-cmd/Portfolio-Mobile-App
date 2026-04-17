import sqlite3

db = r"c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db"
conn = sqlite3.connect(db)

# Which stock is the user on? Check all
stocks = conn.execute("SELECT id, symbol FROM analysis_stocks").fetchall()
print("All stocks:", stocks)

# Check revision/edit tables
for tbl in ['financial_user_edits', 'financial_normalized', 'financial_raw_extraction', 'financial_validation']:
    cols = [c[1] for c in conn.execute(f"PRAGMA table_info({tbl})").fetchall()]
    count = conn.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
    print(f"\n{tbl}: {count} rows, cols={cols}")

# For each stock, check user edits with EPS
for sid, sym in stocks:
    print(f"\n{'='*60}")
    print(f"Stock {sid} ({sym})")

    # Get upload_ids for this stock
    uploads = conn.execute(
        "SELECT id, filename, stock_id, created_at FROM financial_uploads WHERE stock_id=? ORDER BY created_at DESC LIMIT 10",
        (sid,),
    ).fetchall()
    print(f"  Uploads: {uploads}")

    # Check normalized EPS via upload_id
    if uploads:
        upload_ids = [u[0] for u in uploads]
        placeholders = ','.join('?' * len(upload_ids))
        norm = conn.execute(
            f"""SELECT fn.line_item_key, fn.value, fn.period_end_date, fn.statement_type, fn.upload_id
               FROM financial_normalized fn
               WHERE fn.upload_id IN ({placeholders})
                 AND (LOWER(fn.line_item_key) LIKE '%eps%' OR LOWER(fn.line_item_key) LIKE '%earning%per%share%')
               ORDER BY fn.period_end_date DESC LIMIT 15""",
            upload_ids,
        ).fetchall()
        print(f"  Normalized EPS: {norm}")

        # User edits
        edits = conn.execute(
            f"SELECT * FROM financial_user_edits WHERE upload_id IN ({placeholders}) LIMIT 20",
            upload_ids,
        ).fetchall()
        print(f"  User edits: {edits}")

    # Check the ACTUAL current line items (what valuation-defaults reads)
    li_eps = conn.execute(
        """SELECT fs.fiscal_year, fs.fiscal_quarter, li.line_item_code, li.amount
           FROM financial_line_items li
           JOIN financial_statements fs ON fs.id = li.statement_id
           WHERE fs.stock_id = ? AND fs.statement_type = 'income'
             AND (LOWER(li.line_item_code) LIKE '%eps%' 
                  OR LOWER(li.line_item_code) LIKE '%earnings_per_share%'
                  OR UPPER(li.line_item_code) IN ('EPS_DILUTED','EPS_BASIC'))
           ORDER BY fs.fiscal_year DESC LIMIT 15""",
        (sid,),
    ).fetchall()
    print(f"  Line items EPS: {li_eps}")

    # stock_metrics EPS
    sm = conn.execute(
        "SELECT metric_name, metric_value, fiscal_year FROM stock_metrics WHERE stock_id=? AND metric_name='EPS' ORDER BY fiscal_year DESC LIMIT 5",
        (sid,),
    ).fetchall()
    print(f"  stock_metrics EPS: {sm}")

    # What does latest dict give?
    rows = conn.execute(
        "SELECT metric_name, metric_value FROM stock_metrics WHERE stock_id = ? ORDER BY period_end_date DESC",
        (sid,),
    ).fetchall()
    latest = {}
    for r in rows:
        if r[0] not in latest:
            latest[r[0]] = r[1]
    print(f"  latest.get('EPS'): {latest.get('EPS')}")

conn.close()
