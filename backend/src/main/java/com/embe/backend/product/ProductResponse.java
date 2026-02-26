package com.embe.backend.product;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record ProductResponse(
        String id,
        String name,
        String sku,
        String category,
        BigDecimal price,
        BigDecimal cost,
        BigDecimal currentStock,
        Boolean isActive,
        List<String> images,
        Instant createdAt,
        Instant updatedAt
) {
}
