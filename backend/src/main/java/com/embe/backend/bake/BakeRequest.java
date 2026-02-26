package com.embe.backend.bake;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public record BakeRequest(
        @NotBlank(message = "Recipe ID is required")
        String recipeId,
        @NotBlank(message = "Idempotency key is required")
        String idempotencyKey,
        @DecimalMin(value = "0.0001", message = "Batch factor must be greater than 0")
        BigDecimal batchFactor,
        @DecimalMin(value = "0.0001", message = "Bake quantity must be greater than 0")
        BigDecimal bakeQuantity
) {
}
