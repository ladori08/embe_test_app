package com.embe.backend.auth;

import com.embe.backend.common.ApiException;
import com.embe.backend.security.AuthPrincipal;
import com.embe.backend.security.JwtProperties;
import com.embe.backend.security.JwtService;
import com.embe.backend.user.Role;
import com.embe.backend.user.UserAccount;
import com.embe.backend.user.UserRepository;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Set;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final JwtProperties jwtProperties;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService, JwtProperties jwtProperties) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.jwtProperties = jwtProperties;
    }

    public AuthResponse login(LoginRequest request, HttpServletResponse response) {
        UserAccount user = userRepository.findByEmailIgnoreCase(request.email())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }

        AuthPrincipal principal = new AuthPrincipal(user.getId(), user.getEmail(), user.getRoles());
        String token = jwtService.generateToken(principal);
        setAuthCookie(response, token, jwtProperties.getExpirationMinutes() * 60L);

        return new AuthResponse(user.getId(), user.getEmail(), user.getFullName(), user.getRoles());
    }

    public AuthResponse me() {
        AuthPrincipal principal = currentPrincipal();
        UserAccount user = userRepository.findById(principal.userId())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "User not found"));
        return new AuthResponse(user.getId(), user.getEmail(), user.getFullName(), user.getRoles());
    }

    public void logout(HttpServletResponse response) {
        setAuthCookie(response, "", 0);
    }

    public String currentUserId() {
        return currentPrincipal().userId();
    }

    public Set<Role> currentRoles() {
        return currentPrincipal().roles();
    }

    public boolean isAdmin() {
        return currentRoles().contains(Role.ADMIN);
    }

    private AuthPrincipal currentPrincipal() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthPrincipal principal)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized");
        }
        return principal;
    }

    private void setAuthCookie(HttpServletResponse response, String value, long maxAgeSeconds) {
        ResponseCookie cookie = ResponseCookie.from(jwtProperties.getCookieName(), value)
                .httpOnly(true)
                .secure(false)
                .sameSite("Lax")
                .path("/")
                .maxAge(Duration.ofSeconds(maxAgeSeconds))
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}
