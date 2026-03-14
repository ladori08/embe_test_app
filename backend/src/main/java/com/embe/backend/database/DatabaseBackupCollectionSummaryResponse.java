package com.embe.backend.database;

public record DatabaseBackupCollectionSummaryResponse(
        String name,
        long count
) {
}
