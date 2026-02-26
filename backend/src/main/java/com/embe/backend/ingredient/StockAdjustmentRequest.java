package com.embe.backend.ingredient;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record StockAdjustmentRequest(
        @NotNull(message = "Type is required")
        StockTransactionType type,
        @NotNull(message = "Qty is required")
        @DecimalMin(value = "0.0001", message = "Qty must be greater than 0")
        BigDecimal qty,
        BigDecimal unitCost,
        String note
) {
}
