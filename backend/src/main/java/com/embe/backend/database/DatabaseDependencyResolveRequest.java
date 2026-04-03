package com.embe.backend.database;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record DatabaseDependencyResolveRequest(
        @NotBlank(message = "Target collection is required")
        String targetCollection,
        @NotBlank(message = "Target document id is required")
        String targetDocumentId,
        @Valid
        @NotEmpty(message = "At least one resolve operation is required")
        List<DatabaseDependencyResolveOperationRequest> operations
) {
}
