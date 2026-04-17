import sqlite3
conn = sqlite3.connect(r"c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db")
print("=== Dividend/Payout related codes ===")
rows = conn.execute(
    "SELECT DISTINCT line_item_code FROM financial_line_items "
    "WHERE LOWER(line_item_code) LIKE '%divid%' OR LOWER(line_item_code) LIKE '%payout%' "
    "ORDER BY line_item_code"
).fetchall()
for r in rows:
    print(r[0])

print("\n=== EPS related codes ===")
rows = conn.execute(
    "SELECT DISTINCT line_item_code FROM financial_line_items "
    "WHERE LOWER(line_item_code) LIKE '%eps%' OR LOWER(line_item_code) LIKE '%earning%per%' "
    "ORDER BY line_item_code"
).fetchall()
for r in rows:
    print(r[0])

print("\n=== Share count related codes ===")
rows = conn.execute(
    "SELECT DISTINCT line_item_code FROM financial_line_items "
    "WHERE LOWER(line_item_code) LIKE '%share%' OR LOWER(line_item_code) LIKE '%outstanding%' "
    "ORDER BY line_item_code"
).fetchall()
for r in rows:
    print(r[0])

print("\n=== ALL codes for a sample stock (first stock_id) ===")
sid = conn.execute(
    "SELECT DISTINCT fs.stock_id FROM financial_statements fs LIMIT 1"
).fetchone()
if sid:
    stock_id = sid[0]
    rows = conn.execute(
        "SELECT DISTINCT li.line_item_code FROM financial_line_items li "
        "JOIN financial_statements fs ON fs.id = li.statement_id "
        "WHERE fs.stock_id = ? ORDER BY li.line_item_code", (stock_id,)
    ).fetchall()
    print(f"Stock ID: {stock_id}")
    for r in rows:
        print(f"  {r[0]}")

conn.close()
