import re, sys
sys.path.insert(0, r'c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\backend-api')
from app.api.v1.trade_signals import _scrape_ratios_page, _scrape_current_pe, _ratios_url, _statistics_url, _verdict, _QUARTER_OF_MONTH
from datetime import date

ratios_url = _ratios_url('HUMANSOFT.KW', 'HUMANSOFT.KW')
print('ratios url:', ratios_url)
headers, pes = _scrape_ratios_page(ratios_url)
print('n headers:', len(headers), 'n pes:', len(pes))
for h, v in zip(headers, pes):
    print(h, v)
print('---')
stats_url = _statistics_url('HUMANSOFT.KW', 'HUMANSOFT.KW')
print('stats url:', stats_url)
print('current pe:', _scrape_current_pe(stats_url))

for m in re.finditer(r'<table[^>]*>', html):
    print(m.group(0)[:300])
print('---DATA-TEST---')
print(set(re.findall(r'data-test="([^"]+)"', html)))
print('---PE Ratio in TR/TD context---')
for m in re.finditer(r'PE Ratio', html):
    s = max(0, m.start()-400); e = min(len(html), m.end()+1200)
    snippet = html[s:e]
    if '<td' in snippet or '<tr' in snippet:
        print(snippet); print('===')
        break
