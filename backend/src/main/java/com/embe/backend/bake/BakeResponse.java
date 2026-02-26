package com.embe.backend.bake;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record BakeResponse(
        String id,
        String recipeId,
        String productId,
        BigDecimal factor,
        BigDecimal producedQty,
        List<BakeDeduction> deductions,
        Instant createdAt,
        String createdBy
) {
}
