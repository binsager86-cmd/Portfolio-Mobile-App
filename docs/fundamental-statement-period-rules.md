# Fundamental Statement Period Rules

These rules define how the Fundamental Analysis statement views should present annual, TTM, and quarterly periods.

## Annual + TTM

- Annual view must show complete annual fiscal years over time. It must not substitute a raw quarterly period for a missing annual year.
- The final column in Annual + TTM must be the computed TTM period when enough data exists to calculate it.
- TTM must be recalculated from the latest available quarter whenever the user taps **Get Statements** and the fetched statement data changes.
- TTM is derived from: previous annual statement + latest quarter - the same quarter from the previous fiscal year.
- If the required annual or prior-year quarter input is missing, the app must leave TTM absent instead of showing a raw quarter as TTM.

## Quarters

- Quarterly view must show every available fiscal quarter, including Q1, Q2, Q3, and Q4.
- Q4 must remain visible as a standalone quarter in quarterly view, even when Q4 could otherwise look like an annual period.
- Quarterly columns should be ordered oldest-to-newest from left to right.

## Classification

- Annual classification is source-aware: a statement from a quarterly source is not annual.
- Quarterly view is quarter-aware: any statement with a valid fiscal quarter should be eligible for the quarterly grid.