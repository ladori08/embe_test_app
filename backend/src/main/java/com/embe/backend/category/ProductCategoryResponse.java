package com.embe.backend.category;

import java.time.Instant;
import java.util.List;

public record ProductCategoryResponse(
        String id,
        String name,
        String sku,
        List<String> legacySkus,
        Instant createdAt,
        Instant updatedAt
) {
}
