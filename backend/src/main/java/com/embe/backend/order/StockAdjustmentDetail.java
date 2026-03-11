package com.embe.backend.order;

import java.math.BigDecimal;

public record StockAdjustmentDetail(
        String productId,
        String name,
        BigDecimal requestedQty,
        BigDecimal availableQty
) {
}
