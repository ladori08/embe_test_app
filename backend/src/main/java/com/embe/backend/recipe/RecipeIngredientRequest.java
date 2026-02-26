package com.embe.backend.recipe;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record RecipeIngredientRequest(
        @NotBlank(message = "Ingredient ID is required")
        String ingredientId,
        @NotNull(message = "Qty per batch is required")
        @DecimalMin(value = "0.0001", message = "Qty per batch must be greater than 0")
        BigDecimal qtyPerBatch
) {
}
