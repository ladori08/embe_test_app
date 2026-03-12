# Ticket 0013 - Concurrency Verification Result (2026-03-12)

## Test Matrix
- Concurrent users: `2`, `5`, `10`
- Initial stock per scenario: `5`
- Qty per order: `1`
- API: `POST /api/orders`
- Strategy: each scenario creates isolated temp product, sends concurrent requests, verifies final stock, then cleanup.

## Result
| users | success (200) | conflict (409) | other | final stock | expected final | oversell |
|---|---:|---:|---:|---:|---:|---:|
| 2 | 2 | 0 | 0 | 3 | 3 | 0 |
| 5 | 5 | 0 | 0 | 0 | 0 | 0 |
| 10 | 5 | 5 | 0 | 0 | 0 | 0 |

## Verdict
- **PASS**
- No oversell detected.
- No unexpected 5xx in final run.

## Generated raw report
- `reports/order_concurrency_20260312_144017.md`
