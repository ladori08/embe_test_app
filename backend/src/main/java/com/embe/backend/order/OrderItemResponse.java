package com.embe.backend.order;

import java.math.BigDecimal;

public record OrderItemResponse(
        String productId,
        String name,
        BigDecimal price,
        BigDecimal qty
) {
}
