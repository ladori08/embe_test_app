package com.embe.backend.ingredient;

import java.math.BigDecimal;
import java.time.Instant;

public record IngredientResponse(
        String id,
        String name,
        String unit,
        BigDecimal currentStock,
        BigDecimal reorderLevel,
        String costTrackingMethod,
        Instant createdAt,
        Instant updatedAt
) {
}
