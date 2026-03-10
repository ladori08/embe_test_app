package com.embe.backend.user;

import java.time.Instant;
import java.util.Set;

public record AdminUserResponse(
        String id,
        String email,
        String fullName,
        Set<Role> roles,
        Instant createdAt
) {
}
