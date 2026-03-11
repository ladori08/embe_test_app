package com.embe.backend.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record OrderResponse(
        String id,
        String userId,
        List<OrderItemResponse> items,
        OrderStatus status,
        String recipientName,
        String recipientPhone,
        String deliveryAddress,
        String note,
        BigDecimal subtotal,
        BigDecimal tax,
        BigDecimal total,
        boolean stockDeducted,
        Instant createdAt,
        Instant updatedAt
) {
}
