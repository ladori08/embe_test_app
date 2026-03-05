package com.embe.backend.bake;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record BakeRecipeOverrideItem(
        @NotBlank(message = "Ingredient ID is required")
        String ingredientId,
        @NotNull(message = "Quantity per batch is required")
        @DecimalMin(value = "0.0001", message = "Quantity per batch must be greater than 0")
        BigDecimal qtyPerBatch
) {
}
