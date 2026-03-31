package com.embe.backend.database;

import com.embe.backend.common.ApiException;
import org.springframework.http.HttpStatus;

import java.util.Locale;

public enum DatabaseBackupSource {
    LOCAL,
    DRIVE;

    public static DatabaseBackupSource from(String rawValue) {
        if (rawValue == null || rawValue.isBlank()) {
            return LOCAL;
        }
        String normalized = rawValue.trim().toUpperCase(Locale.ROOT);
        try {
            return DatabaseBackupSource.valueOf(normalized);
        } catch (IllegalArgumentException ignored) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported backup source: " + rawValue);
        }
    }
}
