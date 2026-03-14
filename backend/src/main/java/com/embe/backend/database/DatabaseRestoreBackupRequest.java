package com.embe.backend.database;

import jakarta.validation.constraints.NotBlank;

public record DatabaseRestoreBackupRequest(
        @NotBlank(message = "Backup file name is required")
        String fileName
) {
}
