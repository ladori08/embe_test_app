package com.embe.backend.database;

record DatabaseExportPayload(
        byte[] bytes,
        String fileName,
        String contentType
) {
}
