package com.embe.backend.order;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record CreateOrderItemRequest(
        @NotBlank(message = "Product ID is required")
        String productId,
        @NotNull(message = "Qty is required")
        @DecimalMin(value = "0.0001", message = "Qty must be greater than 0")
        BigDecimal qty
) {
}
