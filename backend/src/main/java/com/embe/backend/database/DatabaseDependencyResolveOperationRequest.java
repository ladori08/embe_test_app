package com.embe.backend.database;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record DatabaseDependencyResolveOperationRequest(
        @NotBlank(message = "Collection is required")
        String collection,
        @NotBlank(message = "Document id is required")
        String documentId,
        @NotBlank(message = "Field path is required")
        String fieldPath,
        @NotNull(message = "Action is required")
        DatabaseDependencyResolveAction action,
        String replacementCollection,
        String replacementDocumentId,
        String replacementValue
) {
}
