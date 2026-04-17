import sqlite3
db = sqlite3.connect(r"c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db")

print("=== Cashflow metrics ===")
rows = db.execute(
    "SELECT metric_name, COUNT(*) FROM stock_metrics WHERE metric_type='cashflow' GROUP BY metric_name ORDER BY metric_name"
).fetchall()
for r in rows:
    print(r)

print("\n=== FREE_CASH_FLOW line items ===")
rows = db.execute(
    "SELECT fs.stock_id, fs.fiscal_year, li.amount FROM financial_line_items li "
    "JOIN financial_statements fs ON li.statement_id = fs.id "
    "WHERE UPPER(li.line_item_code) = 'FREE_CASH_FLOW' "
    "GROUP BY fs.stock_id, fs.fiscal_year ORDER BY fs.fiscal_year"
).fetchall()
for r in rows:
    print(r)

db.close()
