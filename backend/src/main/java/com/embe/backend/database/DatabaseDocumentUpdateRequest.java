package com.embe.backend.database;

import jakarta.validation.constraints.NotNull;

import java.util.Map;

public record DatabaseDocumentUpdateRequest(
        @NotNull(message = "Document is required")
        Map<String, Object> document
) {
}
