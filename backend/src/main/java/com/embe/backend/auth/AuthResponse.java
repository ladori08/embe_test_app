package com.embe.backend.auth;

import com.embe.backend.user.Role;

import java.util.Set;

public record AuthResponse(
        String id,
        String email,
        String fullName,
        Set<Role> roles
) {
}
