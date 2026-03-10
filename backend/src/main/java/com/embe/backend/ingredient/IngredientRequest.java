package com.embe.backend.ingredient;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;

public record IngredientRequest(
        @NotBlank(message = "Ingredient name is required")
        String name,
        @Pattern(regexp = "^$|^0$|^[A-Za-z0-9-]{3,20}$", message = "Ingredient code must be 3-20 chars (A-Z, 0-9, -)")
        String ingredientCode,
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
