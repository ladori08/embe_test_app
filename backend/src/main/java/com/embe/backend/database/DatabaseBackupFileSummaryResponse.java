package com.embe.backend.database;

import java.time.Instant;

public record DatabaseBackupFileSummaryResponse(
        String fileName,
        String filePath,
        Instant createdAt,
        long sizeBytes,
        String source,
        String trigger
) {
}
