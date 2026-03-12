# Ticket 0013 - Order Concurrency Verification + Hardening

## Goal
- Verify checkout stock reservation behavior under concurrent order placement.
- Detect race-condition issues (especially oversell).
- Produce repeatable metrics and pass/fail evidence.

## Scenarios
- Matrix: `2,5,10` concurrent users.
- Each user sends one checkout request at the same time.
- Test stock is isolated per scenario:
  - A temporary test product is created with fixed stock.
  - Requests hit `/api/orders` concurrently.
  - Metrics are collected.
  - Test product + related test orders/logs are cleaned up.

## Automated Runner
- Script: `scripts/order_concurrency_matrix.sh`
- Default config:
  - `API_BASE=http://localhost:8080`
  - `SCENARIOS=2,5,10`
  - `INITIAL_STOCK=5`
  - `QTY_PER_ORDER=1`

Run:

```bash
./scripts/order_concurrency_matrix.sh
```

Optional overrides:

```bash
API_BASE=http://localhost:8080 SCENARIOS=2,5,10 INITIAL_STOCK=5 QTY_PER_ORDER=1 ./scripts/order_concurrency_matrix.sh
```

## Report Output
- Generated Markdown report in `reports/`, example:
  - `reports/order_concurrency_YYYYMMDD_HHMMSS.md`
- Includes:
  - concurrent users
  - success/409/other counts
  - final stock vs expected stock
  - oversell flag
  - scenario pass/fail
  - overall pass/fail

## Pass Criteria
- No oversell.
- Final stock equals expected stock.
- No unexpected status codes (`other = 0`).
