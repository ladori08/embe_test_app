package com.embe.backend.product;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;

public record ProductRequest(
        @NotBlank(message = "Product name is required")
        String name,
        @NotBlank(message = "SKU is required")
        String sku,
        @NotBlank(message = "Category is required")
        String category,
        @NotNull(message = "Price is required")
        @DecimalMin(value = "0", message = "Price cannot be negative")
        BigDecimal price,
        @DecimalMin(value = "0", message = "Cost cannot be negative")
        BigDecimal cost,
        @NotNull(message = "Current stock is required")
        @DecimalMin(value = "0", message = "Stock cannot be negative")
        BigDecimal currentStock,
        Boolean isActive,
        List<String> images
) {
}
