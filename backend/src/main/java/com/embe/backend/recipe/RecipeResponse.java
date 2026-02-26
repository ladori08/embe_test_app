package com.embe.backend.recipe;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record RecipeResponse(
        String id,
        String productId,
        String productName,
        BigDecimal yieldQty,
        List<RecipeIngredientResponse> items,
        Instant createdAt,
        Instant updatedAt
) {
}
