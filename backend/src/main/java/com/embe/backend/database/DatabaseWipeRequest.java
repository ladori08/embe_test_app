package com.embe.backend.database;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record DatabaseWipeRequest(
        @NotNull(message = "Scope is required")
        DatabaseWipeScope scope,
        String collection,
        @NotBlank(message = "Confirm text is required")
        String confirmText
) {
}
