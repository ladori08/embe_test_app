package com.embe.backend.database;

import java.util.List;

public record DatabaseQueryResponse(
        String collection,
        long total,
        int page,
        int pageSize,
        List<DatabaseQueryRow> rows
) {
}
