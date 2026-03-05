package com.embe.backend.user;

import com.embe.backend.audit.AuditAction;
import com.embe.backend.audit.AuditLogService;
import com.embe.backend.audit.AuditModule;
import com.embe.backend.auth.AuthService;
import com.embe.backend.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class UserAdminService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthService authService;
    private final AuditLogService auditLogService;

    public UserAdminService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AuthService authService,
            AuditLogService auditLogService
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.authService = authService;
        this.auditLogService = auditLogService;
    }

    public List<AdminUserResponse> list() {
        return userRepository.findAll().stream()
                .sorted(Comparator.comparing(UserAccount::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toResponse)
                .toList();
    }

    public AdminUserResponse create(AdminUserCreateRequest request) {
        String email = normalizeEmail(request.email());
        userRepository.findByEmailIgnoreCase(email).ifPresent(existing -> {
            throw new ApiException(HttpStatus.CONFLICT, "Email already exists");
        });

        UserAccount user = new UserAccount();
        user.setEmail(email);
        user.setFullName(normalizeFullName(request.fullName()));
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRoles(normalizeRoles(request.roles()));
        user.setCreatedAt(Instant.now());

        UserAccount saved = userRepository.save(user);
        AdminUserResponse response = toResponse(saved);

        auditLogService.record(
                AuditModule.USER,
                AuditAction.CREATE,
                "Created user " + response.email(),
                response.id(),
                null,
                response,
                Map.of("roles", response.roles().stream().map(Enum::name).toList())
        );

        return response;
    }

    public AdminUserResponse update(String id, AdminUserUpdateRequest request) {
        UserAccount user = getEntity(id);
        AdminUserResponse before = toResponse(user);

        Set<Role> nextRoles = normalizeRoles(request.roles());
        ensureSelfPrivilegedRoleNotRemoved(user, nextRoles, Role.SUPERADMIN);
        ensureSelfPrivilegedRoleNotRemoved(user, nextRoles, Role.ADMIN);

        user.setFullName(normalizeFullName(request.fullName()));
        user.setRoles(nextRoles);

        boolean passwordChanged = false;
        if (request.password() != null && !request.password().isBlank()) {
            ensurePasswordLength(request.password());
            user.setPasswordHash(passwordEncoder.encode(request.password()));
            passwordChanged = true;
        }

        UserAccount saved = userRepository.save(user);
        AdminUserResponse after = toResponse(saved);

        auditLogService.record(
                AuditModule.USER,
                AuditAction.UPDATE,
                "Updated user " + after.email(),
                after.id(),
                before,
                after,
                Map.of(
                        "passwordChanged", passwordChanged,
                        "roles", after.roles().stream().map(Enum::name).toList()
                )
        );

        return after;
    }

    public void delete(String id) {
        UserAccount user = getEntity(id);
        ensureCannotDeleteCurrentUser(user);

        AdminUserResponse before = toResponse(user);
        userRepository.delete(user);

        auditLogService.record(
                AuditModule.USER,
                AuditAction.DELETE,
                "Deleted user " + before.email(),
                before.id(),
                before,
                null,
                Map.of("roles", before.roles().stream().map(Enum::name).toList())
        );
    }

    private void ensureSelfPrivilegedRoleNotRemoved(UserAccount targetUser, Set<Role> nextRoles, Role protectedRole) {
        if (!targetUser.getId().equals(currentUserId())) {
            return;
        }
        Set<Role> currentRoles = normalizeRolesNullable(targetUser.getRoles());
        if (currentRoles.contains(protectedRole) && !nextRoles.contains(protectedRole)) {
            throw new ApiException(HttpStatus.CONFLICT, "You cannot remove " + protectedRole.name() + " role from your own account");
        }
    }

    private void ensureCannotDeleteCurrentUser(UserAccount targetUser) {
        if (targetUser.getId().equals(currentUserId())) {
            throw new ApiException(HttpStatus.CONFLICT, "You cannot delete your own account");
        }
    }

    private void ensurePasswordLength(String password) {
        int length = password.trim().length();
        if (length < 6 || length > 128) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Password must be between 6 and 128 characters");
        }
    }

    private String normalizeEmail(String email) {
        String normalized = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        if (normalized.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Email is required");
        }
        return normalized;
    }

    private String normalizeFullName(String fullName) {
        String normalized = fullName == null ? "" : fullName.trim().replaceAll("\\s+", " ");
        if (normalized.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Full name is required");
        }
        return normalized;
    }

    private Set<Role> normalizeRoles(Set<Role> roles) {
        if (roles == null || roles.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "At least one role is required");
        }
        return normalizeRolesNullable(roles);
    }

    private Set<Role> normalizeRolesNullable(Set<Role> roles) {
        if (roles == null || roles.isEmpty()) {
            return Set.of();
        }
        Set<Role> normalized = new LinkedHashSet<>();
        for (Role role : roles) {
            if (role == null || role == Role.CLIENT) {
                normalized.add(Role.CUSTOMER);
                continue;
            }
            normalized.add(role);
        }
        return normalized;
    }

    private UserAccount getEntity(String id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));
    }

    private String currentUserId() {
        try {
            return authService.currentUserId();
        } catch (Exception ignored) {
            return "system";
        }
    }

    private AdminUserResponse toResponse(UserAccount user) {
        Set<Role> roles = normalizeRolesNullable(user.getRoles());
        return new AdminUserResponse(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                roles,
                user.getCreatedAt()
        );
    }
}
