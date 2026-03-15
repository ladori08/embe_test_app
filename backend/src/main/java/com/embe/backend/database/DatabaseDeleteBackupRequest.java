package com.embe.backend.database;

import jakarta.validation.constraints.NotBlank;

public record DatabaseDeleteBackupRequest(
        @NotBlank(message = "Backup file name is required")
        String fileName,
        @NotBlank(message = "Confirm text is required")
        String confirmText
) {
}
