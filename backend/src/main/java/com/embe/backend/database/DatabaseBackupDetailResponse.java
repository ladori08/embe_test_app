package com.embe.backend.database;

import java.time.Instant;
import java.util.List;

public record DatabaseBackupDetailResponse(
        String fileName,
        String filePath,
        Instant createdAt,
        String trigger,
        String actorEmail,
        String database,
        long totalDocuments,
        List<DatabaseBackupCollectionSummaryResponse> collections
) {
}
