# Ticket 0016 - Product Cost Governance + Product Lot FIFO (Planned)

## Background
Current product cost can still be edited manually, while ingredient cost already comes from stock-in lots and FIFO consumption.

## Business goals
1. Product cost should no longer be manually entered as source-of-truth.
2. Product cost should be derived from actual production consumption cost.
3. Product inventory should support lot-level tracking for better COGS and traceability.

## Proposed direction
1. Lock manual update of `product.cost` (UI + backend validation).
2. Introduce `product_lots` generated from each bake/produce run:
   - `productId`
   - `bakeRecordId`
   - `producedQty`
   - `remainingQty`
   - `unitCost`
   - `totalCost`
   - `producedAt`
   - `recipeVersion`
   - `note` (optional)
3. On order reserve/sell, deduct product stock by FIFO from product lots.
4. Persist deduction breakdown (which lot, qty, unitCost, subtotal) for each order item.
5. On order cancel/refund paths, restore stock back to lots consistently.

## Why this is needed
1. Accurate COGS per order (not overwritten by latest bake only).
2. Better margin/profit analytics by period/order.
3. Full traceability from ingredient lots -> bake -> product lots -> orders.

## Compatibility & migration notes
1. Keep old product records readable.
2. Existing `product.cost` remains as fallback display only during migration.
3. Add migration/backfill strategy before enforcing strict lot-only cost accounting.

## Out of scope for current branch
This ticket is planning/spec only. No backend or schema implementation is included in the current branch.
