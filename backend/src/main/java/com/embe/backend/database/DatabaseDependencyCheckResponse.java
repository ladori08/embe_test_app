package com.embe.backend.database;

import java.util.List;

public record DatabaseDependencyCheckResponse(
        String targetCollection,
        String targetDocumentId,
        String targetDocumentTitle,
        int dependencyCount,
        List<DatabaseDependencyReferenceResponse> dependencies
) {
}
