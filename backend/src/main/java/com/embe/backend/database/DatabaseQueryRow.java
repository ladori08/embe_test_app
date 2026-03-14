package com.embe.backend.database;

import java.util.Map;

public record DatabaseQueryRow(
        String id,
        Map<String, Object> document
) {
}
