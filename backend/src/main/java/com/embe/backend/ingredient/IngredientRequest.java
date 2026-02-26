package com.embe.backend.ingredient;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;

public record IngredientRequest(
        @NotBlank(message = "Ingredient name is required")
        String name,
        @NotBlank(message = "Unit is required")
        @Pattern(regexp = "^(g|ml|pcs)$", message = "Unit must be g, ml, or pcs")
        String unit,
        @DecimalMin(value = "0", message = "Current stock cannot be negative")
        BigDecimal currentStock,
        @DecimalMin(value = "0", message = "Reorder level cannot be negative")
        BigDecimal reorderLevel,
        String costTrackingMethod
) {
}
