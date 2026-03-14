package com.embe.backend.product;

import java.math.BigDecimal;
import java.time.Instant;

public record ProductStockEvent(
        String productId,
        BigDecimal currentStock,
        Instant updatedAt
) {
}
