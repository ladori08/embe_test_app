package com.embe.backend.database;

import java.time.Instant;

public record DatabaseRestoreBackupResponse(
        String restoredFromFile,
        Instant restoredAt,
        long collectionsRestored,
        long documentsRestored,
        String preRestoreBackupFile
) {
}
