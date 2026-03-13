package com.embe.backend.product;

import java.math.BigDecimal;
import java.time.Instant;

public record ProductLotResponse(
        String id,
        String productId,
        String lotCode,
        String bakeRecordId,
        Integer recipeVersion,
        BigDecimal producedQty,
        BigDecimal remainingQty,
        BigDecimal unitCost,
        BigDecimal totalCost,
        Instant producedAt,
        String note,
        Instant createdAt,
        Instant updatedAt
) {
}
