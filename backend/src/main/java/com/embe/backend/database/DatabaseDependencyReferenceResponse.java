package com.embe.backend.database;

public record DatabaseDependencyReferenceResponse(
        String collection,
        String documentId,
        String documentTitle,
        String fieldPath,
        String valuePreview
) {
}
