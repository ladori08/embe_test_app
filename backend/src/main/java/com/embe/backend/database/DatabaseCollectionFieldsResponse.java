package com.embe.backend.database;

import java.util.List;

public record DatabaseCollectionFieldsResponse(
        String collection,
        List<String> fields
) {
}
