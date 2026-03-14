package com.embe.backend.database;

import jakarta.validation.constraints.NotBlank;

public record DatabaseUnlockRequest(
        @NotBlank(message = "Password is required")
        String password
) {
}
