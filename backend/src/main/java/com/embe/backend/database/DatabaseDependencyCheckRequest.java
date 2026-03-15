package com.embe.backend.database;

import jakarta.validation.constraints.NotBlank;

public record DatabaseDependencyCheckRequest(
        @NotBlank(message = "Collection is required")
        String collection,
        @NotBlank(message = "Document id is required")
        String documentId
) {
}
