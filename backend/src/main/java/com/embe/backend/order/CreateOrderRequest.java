package com.embe.backend.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CreateOrderRequest(
        @NotEmpty(message = "Order items are required")
        List<@Valid CreateOrderItemRequest> items,
        @NotBlank(message = "Recipient name is required")
        @Size(max = 120, message = "Recipient name must be at most 120 characters")
        String recipientName,
        @NotBlank(message = "Recipient phone is required")
        @Size(min = 8, max = 20, message = "Recipient phone must be 8-20 characters")
        @Pattern(
                regexp = "^\\+?[0-9][0-9\\-()\\s]{6,18}[0-9]$",
                message = "Recipient phone format is invalid"
        )
        String recipientPhone,
        @NotBlank(message = "Delivery address is required")
        @Size(min = 5, max = 255, message = "Delivery address must be 5-255 characters")
        String deliveryAddress,
        @NotBlank(message = "Delivery date is required")
        @Pattern(regexp = "^\\d{4}-\\d{2}-\\d{2}$", message = "Delivery date must be in YYYY-MM-DD format")
        String deliveryDate,
        @NotBlank(message = "Delivery time is required")
        @Pattern(regexp = "^([01]\\d|2[0-3]):[0-5]\\d$", message = "Delivery time must be in HH:mm format")
        String deliveryTime,
        @NotNull(message = "Payment method is required")
        PaymentMethod paymentMethod,
        @Size(max = 500, message = "Note must be at most 500 characters")
        String note
) {
}
