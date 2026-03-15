package com.embe.backend.database;

import java.time.Instant;

public record DatabaseDeleteBackupResponse(
        String fileName,
        Instant deletedAt
) {
}
