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
        String deliveryDate,
        String deliveryTime,
        PaymentMethod paymentMethod,
        String note,
        BigDecimal subtotal,
        BigDecimal tax,
        BigDecimal total,
        boolean stockDeducted,
        String cancelReason,
        Instant holdExpiresAt,
        Instant createdAt,
        Instant updatedAt
) {
}
