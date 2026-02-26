package com.embe.backend.recipe;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;

public record RecipeRequest(
        @NotBlank(message = "Product ID is required")
        String productId,
        @NotNull(message = "Yield quantity is required")
        @DecimalMin(value = "0.0001", message = "Yield quantity must be greater than 0")
        BigDecimal yieldQty,
        @NotEmpty(message = "Recipe items are required")
        List<@Valid RecipeIngredientRequest> items
) {
}
