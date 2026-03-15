package com.embe.backend.database;

public record DatabaseWipeResponse(
        DatabaseWipeScope scope,
        String collection,
        long deletedDocuments,
        String backupFile
) {
}
