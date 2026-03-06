package com.embe.backend.ingredient;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record IngredientStockTransactionView(
        String id,
        String ingredientId,
        String ingredientName,
        String ingredientUnit,
        StockTransactionType type,
        BigDecimal qty,
        String inputUnit,
        BigDecimal unitCost,
        String note,
        String lotCode,
        BigDecimal remainingQty,
        List<StockLotAllocation> allocations,
        Instant createdAt,
        String createdBy
) {
}
