package com.embe.backend.database;

import java.time.Instant;

public record DatabaseSessionToken(
        String token,
        Instant expiresAt
) {
}
