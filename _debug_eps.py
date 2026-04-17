import sqlite3

db = r"c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db"
conn = sqlite3.connect(db)

stocks = conn.execute("SELECT id, symbol FROM analysis_stocks LIMIT 5").fetchall()
print("Stocks:", stocks)

if stocks:
    sid = stocks[0][0]
    sym = stocks[0][1]
    print(f"\n=== Simulating valuation-defaults for stock_id={sid} ({sym}) ===")

    # 1) stock_metrics EPS (will be empty for this stock)
    eps_m = conn.execute(
        "SELECT metric_name, metric_value FROM stock_metrics WHERE stock_id=? ORDER BY period_end_date DESC",
        (sid,),
    ).fetchall()
    latest = {}
    for r in eps_m:
        if r[0] not in latest:
            latest[r[0]] = r[1]
    eps_ttm = latest.get("EPS")
    print(f"1) stock_metrics EPS: {eps_ttm}")

    # 2) Fallback: line items with broadened search
    if eps_ttm is None:
        eps_li_row = conn.execute(
            """SELECT li.line_item_code, li.amount FROM financial_line_items li
               JOIN financial_statements fs ON fs.id = li.statement_id
               WHERE fs.stock_id = ? AND fs.statement_type = 'income'
                 AND fs.fiscal_quarter IS NULL
                 AND (UPPER(li.line_item_code) IN ('EPS_DILUTED','EPS_BASIC')
                      OR LOWER(li.line_item_code) LIKE '%earnings_per_share%'
                      OR LOWER(li.line_item_code) LIKE '%eps_%')
               ORDER BY fs.fiscal_year DESC LIMIT 1""",
            (sid,),
        ).fetchone()
        print(f"2) Broadened EPS line item: {eps_li_row}")
        if eps_li_row:
            code, val = eps_li_row
            if val is not None and ('fils' in code.lower() or 'cents' in code.lower() or 'halala' in code.lower()):
                val = val / 1000.0
            eps_ttm = val
    print(f"=> EPS TTM: {eps_ttm}")

    # 3) Historical EPS for growth calc
    eps_rows_raw = conn.execute(
        """SELECT fs.fiscal_year, li.line_item_code, li.amount FROM financial_line_items li
           JOIN financial_statements fs ON fs.id = li.statement_id
           WHERE fs.stock_id = ? AND fs.statement_type = 'income'
             AND fs.fiscal_quarter IS NULL
             AND (UPPER(li.line_item_code) IN ('EPS_DILUTED','EPS_BASIC')
                  OR LOWER(li.line_item_code) LIKE '%earnings_per_share%'
                  OR LOWER(li.line_item_code) LIKE '%eps_%')
             AND li.amount IS NOT NULL
           ORDER BY fs.fiscal_year""",
        (sid,),
    ).fetchall()
    print(f"3) Raw EPS rows: {eps_rows_raw}")
    seen_years = set()
    eps_history = []
    for er in eps_rows_raw:
        fy = er[0]
        if fy not in seen_years:
            seen_years.add(fy)
            code = er[1]
            val = er[2]
            if val is not None and ('fils' in code.lower() or 'cents' in code.lower() or 'halala' in code.lower()):
                val = val / 1000.0
            eps_history.append({"year": fy, "eps": round(val, 4) if val else None})
    print(f"4) EPS history: {eps_history}")

    # Growth calc
    yoy = []
    for i in range(1, len(eps_history)):
        prev = eps_history[i-1]["eps"]
        curr = eps_history[i]["eps"]
        if prev and prev > 0 and curr is not None:
            yoy.append(((curr - prev) / prev) * 100)
    if yoy:
        avg = sum(yoy) / len(yoy)
        print(f"5) YoY growth rates: {[round(g,2) for g in yoy]}, avg={round(avg,2)}, capped={round(min(max(avg,0),15),2)}")
    else:
        print("5) No growth rates computed")

conn.close()

# Find stocks
stocks = conn.execute("SELECT id, symbol FROM analysis_stocks LIMIT 5").fetchall()
print("Stocks:", stocks)

if stocks:
    sid = stocks[0][0]
    sym = stocks[0][1]
    print(f"\n=== Checking stock_id={sid} ({sym}) ===")

    # 1) stock_metrics EPS
    eps_m = conn.execute(
        "SELECT metric_name, metric_value, fiscal_year FROM stock_metrics WHERE stock_id=? AND metric_name='EPS' ORDER BY fiscal_year DESC LIMIT 5",
        (sid,),
    ).fetchall()
    print(f"\n1) stock_metrics EPS rows: {eps_m}")

    # 2) All metric names (sample)
    names = conn.execute(
        "SELECT DISTINCT metric_name FROM stock_metrics WHERE stock_id=? LIMIT 30",
        (sid,),
    ).fetchall()
    print(f"\n2) All metric names: {[n[0] for n in names]}")

    # 3) EPS line items from income statements
    eps_li = conn.execute(
        """SELECT fs.fiscal_year, li.line_item_code, li.amount 
           FROM financial_line_items li 
           JOIN financial_statements fs ON fs.id = li.statement_id 
           WHERE fs.stock_id = ? AND fs.statement_type = 'income' 
             AND UPPER(li.line_item_code) IN ('EPS_DILUTED','EPS_BASIC')
           ORDER BY fs.fiscal_year DESC LIMIT 10""",
        (sid,),
    ).fetchall()
    print(f"\n3) EPS line items (income): {eps_li}")

    # 4) Net Income line items
    ni_li = conn.execute(
        """SELECT fs.fiscal_year, li.line_item_code, li.amount
           FROM financial_line_items li
           JOIN financial_statements fs ON fs.id = li.statement_id
           WHERE fs.stock_id = ? AND fs.statement_type = 'income'
             AND UPPER(li.line_item_code) = 'NET_INCOME'
           ORDER BY fs.fiscal_year DESC LIMIT 5""",
        (sid,),
    ).fetchall()
    print(f"\n4) NET_INCOME line items: {ni_li}")

    # 5) Check stocks and analysis_stocks columns
    cols_stocks = conn.execute("PRAGMA table_info(stocks)").fetchall()
    print(f"\n5a) stocks columns: {[c[1] for c in cols_stocks]}")
    cols_as = conn.execute("PRAGMA table_info(analysis_stocks)").fetchall()
    print(f"5b) analysis_stocks columns: {[c[1] for c in cols_as]}")
    # Show first analysis_stock row
    as_row = conn.execute("SELECT * FROM analysis_stocks WHERE id=?", (sid,)).fetchone()
    print(f"5c) analysis_stocks row: {as_row}")

    # Check shares line items (SHARES_DILUTED, SHARES_BASIC, SHARE_COUNT)
    share_li = conn.execute(
        """SELECT DISTINCT li.line_item_code FROM financial_line_items li
           JOIN financial_statements fs ON fs.id = li.statement_id
           WHERE fs.stock_id = ? AND UPPER(li.line_item_code) LIKE '%SHARE%'""",
        (sid,),
    ).fetchall()
    print(f"\n5d) SHARE-related line items: {[s[0] for s in share_li]}")
    
    # See actual share values
    share_vals = conn.execute(
        """SELECT fs.fiscal_year, li.line_item_code, li.amount 
           FROM financial_line_items li
           JOIN financial_statements fs ON fs.id = li.statement_id
           WHERE fs.stock_id = ? AND UPPER(li.line_item_code) LIKE '%SHARE%'
           ORDER BY fs.fiscal_year DESC LIMIT 10""",
        (sid,),
    ).fetchall()
    print(f"5e) Share values: {share_vals}")

    # 6) All line_item_codes containing 'eps' or 'earning' for this stock
    codes = conn.execute(
        """SELECT DISTINCT li.line_item_code FROM financial_line_items li
           JOIN financial_statements fs ON fs.id = li.statement_id
           WHERE fs.stock_id = ? AND fs.statement_type = 'income'""",
        (sid,),
    ).fetchall()
    all_codes = [c[0] for c in codes]
    eps_related = [c for c in all_codes if 'eps' in c.lower() or 'earning' in c.lower() or 'per_share' in c.lower()]
    print(f"\n6) EPS-related codes: {eps_related}")
    print(f"   All income codes ({len(all_codes)}): {all_codes}")

    # 7) Check the latest metrics dict that the endpoint builds
    rows = conn.execute(
        "SELECT metric_name, metric_value FROM stock_metrics WHERE stock_id = ? ORDER BY period_end_date DESC",
        (sid,),
    ).fetchall()
    latest = {}
    for r in rows:
        if r[0] not in latest:
            latest[r[0]] = r[1]
    print(f"\n7) latest dict EPS = {latest.get('EPS')}")
    print(f"   All latest keys: {list(latest.keys())}")

conn.close()

if stocks:
    sid = stocks[0][0]
    sym = stocks[0][1]
    print(f"\n=== Checking stock_id={sid} ({sym}) ===")

    # 1) stock_metrics EPS
    eps_m = conn.execute(
        "SELECT metric_name, metric_value, fiscal_year FROM stock_metrics WHERE stock_id=? AND metric_name='EPS' ORDER BY fiscal_year DESC LIMIT 5",
        (sid,),
    ).fetchall()
    print(f"\n1) stock_metrics EPS rows: {eps_m}")

    # 2) All metric names (sample)
    names = conn.execute(
        "SELECT DISTINCT metric_name FROM stock_metrics WHERE stock_id=? LIMIT 30",
        (sid,),
    ).fetchall()
    print(f"\n2) All metric names for this stock: {[n[0] for n in names]}")

    # 3) EPS line items from income statements
    eps_li = conn.execute(
        """SELECT fs.fiscal_year, li.line_item_code, li.amount
           FROM financial_line_items li
           JOIN financial_statements fs ON fs.id = li.statement_id
           WHERE fs.stock_id = ? AND fs.statement_type = 'income'
             AND UPPER(li.line_item_code) IN ('EPS_DILUTED','EPS_BASIC')
           ORDER BY fs.fiscal_year DESC LIMIT 10""",
        (sid,),
    ).fetchall()
    print(f"\n3) EPS line items (income): {eps_li}")

    # 4) Net Income line items
    ni_li = conn.execute(
        """SELECT fs.fiscal_year, li.line_item_code, li.amount
           FROM financial_line_items li
           JOIN financial_statements fs ON fs.id = li.statement_id
           WHERE fs.stock_id = ? AND fs.statement_type = 'income'
             AND UPPER(li.line_item_code) = 'NET_INCOME'
           ORDER BY fs.fiscal_year DESC LIMIT 5""",
        (sid,),
    ).fetchall()
    print(f"\n4) NET_INCOME line items: {ni_li}")

    # 5) outstanding_shares
    sh = conn.execute("SELECT outstanding_shares FROM stocks WHERE id=?", (sid,)).fetchone()
    print(f"\n5) outstanding_shares from stocks table: {sh}")

    # 6) Check if stocks table has this stock at all
    sh2 = conn.execute("SELECT id, symbol, outstanding_shares FROM stocks LIMIT 5").fetchall()
    print(f"\n6) stocks table sample: {sh2}")

    # 7) All line_item_codes for this stock's income statements (find EPS variants)
    codes = conn.execute(
        """SELECT DISTINCT UPPER(li.line_item_code) FROM financial_line_items li
           JOIN financial_statements fs ON fs.id = li.statement_id
           WHERE fs.stock_id = ? AND fs.statement_type = 'income'""",
        (sid,),
    ).fetchall()
    eps_related = [c[0] for c in codes if 'EPS' in c[0] or 'EARNING' in c[0] or 'PER_SHARE' in c[0]]
    print(f"\n7) EPS-related line_item_codes: {eps_related}")
    print(f"   All income codes: {[c[0] for c in codes]}")

conn.close()
