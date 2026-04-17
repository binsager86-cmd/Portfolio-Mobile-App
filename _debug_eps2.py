import sqlite3

db = r"c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db"
conn = sqlite3.connect(db)

# All analysis_stocks
stocks = conn.execute("SELECT id, symbol, company_name FROM analysis_stocks").fetchall()
print("All analysis_stocks:", stocks)

for sid, sym, name in stocks:
    print(f"\n{'='*60}")
    print(f"Stock id={sid} sym={sym} name={name}")

    # All financial statements
    stmts = conn.execute(
        "SELECT id, statement_type, fiscal_year, fiscal_quarter, period_end_date FROM financial_statements WHERE stock_id=? ORDER BY fiscal_year DESC, fiscal_quarter",
        (sid,),
    ).fetchall()
    print(f"  Statements ({len(stmts)}):")
    for s in stmts:
        print(f"    id={s[0]} type={s[1]} year={s[2]} q={s[3]} period={s[4]}")

    # All EPS-like line items across ALL statement types
    eps_items = conn.execute(
        """SELECT fs.fiscal_year, fs.fiscal_quarter, fs.statement_type, li.line_item_code, li.amount
           FROM financial_line_items li
           JOIN financial_statements fs ON fs.id = li.statement_id
           WHERE fs.stock_id = ?
             AND (LOWER(li.line_item_code) LIKE '%eps%'
                  OR LOWER(li.line_item_code) LIKE '%earnings_per_share%'
                  OR LOWER(li.line_item_code) LIKE '%earning_per_share%')
           ORDER BY fs.fiscal_year DESC, fs.fiscal_quarter""",
        (sid,),
    ).fetchall()
    print(f"  EPS-like items ({len(eps_items)}):")
    for e in eps_items:
        print(f"    year={e[0]} q={e[1]} type={e[2]} code={e[3]} amount={e[4]}")

    # stock_metrics for EPS
    metrics = conn.execute(
        "SELECT metric_name, metric_value, fiscal_year, fiscal_quarter, period_end_date FROM stock_metrics WHERE stock_id=? AND metric_name='EPS' ORDER BY fiscal_year DESC",
        (sid,),
    ).fetchall()
    print(f"  stock_metrics EPS ({len(metrics)}):")
    for m in metrics:
        print(f"    name={m[0]} val={m[1]} year={m[2]} q={m[3]} period={m[4]}")

    # Check the latest dict approach
    all_metrics = conn.execute(
        "SELECT metric_name, metric_value, period_end_date FROM stock_metrics WHERE stock_id=? ORDER BY period_end_date DESC",
        (sid,),
    ).fetchall()
    latest = {}
    for r in all_metrics:
        if r[0] not in latest:
            latest[r[0]] = r[1]
    print(f"  latest.get('EPS') = {latest.get('EPS')}")
    if latest:
        print(f"  All latest keys: {list(latest.keys())[:20]}")

conn.close()
