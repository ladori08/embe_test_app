package com.embe.backend.database;

public record DatabaseDependencyResolveResponse(
        String targetCollection,
        String targetDocumentId,
        int totalOperations,
        int appliedOperations
) {
}
