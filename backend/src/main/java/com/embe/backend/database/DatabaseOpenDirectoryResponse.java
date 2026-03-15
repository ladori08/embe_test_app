package com.embe.backend.database;

public record DatabaseOpenDirectoryResponse(
        boolean opened,
        String message
) {
}
