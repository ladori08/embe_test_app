package com.embe.backend.bake;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

public record BakeRequest(
        @NotBlank(message = "Recipe ID is required")
        String recipeId,
        @NotBlank(message = "Idempotency key is required")
        String idempotencyKey,
        @DecimalMin(value = "0.0001", message = "Batch factor must be greater than 0")
        BigDecimal batchFactor,
        @DecimalMin(value = "0.0001", message = "Bake quantity must be greater than 0")
        BigDecimal bakeQuantity,
        @Size(max = 200, message = "Too many override lines")
        List<@Valid BakeRecipeOverrideItem> overrideItems
) {
}
