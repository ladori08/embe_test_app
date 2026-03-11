package com.embe.backend.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CreateOrderRequest(
        @NotEmpty(message = "Order items are required")
        List<@Valid CreateOrderItemRequest> items,
        @NotBlank(message = "Recipient name is required")
        String recipientName,
        @NotBlank(message = "Recipient phone is required")
        String recipientPhone,
        @NotBlank(message = "Delivery address is required")
        String deliveryAddress,
        @Size(max = 500, message = "Note must be at most 500 characters")
        String note
) {
}
