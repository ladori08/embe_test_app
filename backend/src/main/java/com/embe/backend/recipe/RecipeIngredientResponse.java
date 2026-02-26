package com.embe.backend.recipe;

import java.math.BigDecimal;

public record RecipeIngredientResponse(
        String ingredientId,
        String ingredientName,
        BigDecimal qtyPerBatch
) {
}
