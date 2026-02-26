package com.embe.backend.security;

import com.embe.backend.user.Role;

import java.util.Set;

public record AuthPrincipal(String userId, String email, Set<Role> roles) {
}
