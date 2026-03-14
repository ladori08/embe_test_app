package com.embe.backend.database;

import java.time.Instant;

public record DatabaseBackupResponse(
        String fileName,
        String filePath,
        String trigger,
        Instant createdAt
) {
}
