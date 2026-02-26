package com.embe.backend.common;

import java.time.Instant;

public record ApiError(
        String message,
        int status,
        Instant timestamp,
        String path
) {
}
