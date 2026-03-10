package com.embe.backend.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.Set;

public record AdminUserUpdateRequest(
        @NotBlank(message = "Full name is required")
        String fullName,
        String password,
        @NotEmpty(message = "At least one role is required")
        Set<Role> roles
) {
}
