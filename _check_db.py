import sqlite3, json

conn = sqlite3.connect(r'c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db')
cur = conn.cursor()

# Check saved DCF valuations
cur.execute("SELECT id, valuation_date, intrinsic_value, parameters FROM valuation_models WHERE model_type='dcf' ORDER BY id DESC LIMIT 3")
for r in cur.fetchall():
    params = json.loads(r[3]) if r[3] else {}
    print(f"ID={r[0]} date={r[1]} IV={r[2]}")
    cash_val = params.get("cash")
    debt_val = params.get("debt")
    g1_val = params.get("growth_stage1")
    g2_val = params.get("growth_stage2")
    print(f"  cash={cash_val} debt={debt_val} g1={g1_val} g2={g2_val}")

print()
print("--- Cash line items for stock 1 ---")
cur.execute("""SELECT li.line_item_code, li.amount, fs.fiscal_year 
FROM financial_line_items li
JOIN financial_statements fs ON fs.id = li.statement_id
WHERE fs.stock_id = 1 AND fs.statement_type = 'balance'
  AND fs.fiscal_quarter IS NULL
  AND (UPPER(li.line_item_code) IN ('CASH_AND_EQUIVALENTS','CASH_AND_CASH_EQUIVALENTS',
    'CASH_EQUIVALENTS','CASH_SHORT_TERM_INVESTMENTS','CASH','CASH_BALANCES')
    OR LOWER(li.line_item_code) = 'cash')
  AND li.amount IS NOT NULL
ORDER BY fs.fiscal_year DESC""")
for r in cur.fetchall():
    print(f"  code={r[0]} amount={r[1]} year={r[2]}")

conn.close()
