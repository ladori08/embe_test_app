package com.embe.backend.database;

import java.time.Instant;

public record DatabaseUnlockResponse(
        String accessToken,
        Instant expiresAt,
        String backupFileName,
        String backupFilePath
) {
}
