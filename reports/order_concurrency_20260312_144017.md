# Order Concurrency Matrix Report

- Generated at: 20260312_144017
- API base: http://localhost:8080
- Initial stock per scenario: 5
- Qty per order: 1
- Scenario users: 2,5,10

| users | initial_stock | qty/order | success(200) | conflict(409) | other | final_stock | expected_final | oversell | result | notes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| 2 | 5 | 1 | 2 | 0 | 0 | 3.000000 | 3.000000 | 0 | PASS | - |
| 5 | 5 | 1 | 5 | 0 | 0 | 0.000000 | 0.000000 | 0 | PASS | - |
| 10 | 5 | 1 | 5 | 5 | 0 | 0.000000 | 0.000000 | 0 | PASS | - |

**OVERALL RESULT: PASS**
