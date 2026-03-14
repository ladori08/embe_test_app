package com.embe.backend.database;

import com.embe.backend.common.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class DatabaseConsoleSessionService {

    private final Duration ttl;
    private final Map<String, SessionEntry> sessions = new ConcurrentHashMap<>();

    public DatabaseConsoleSessionService(@Value("${embe.database-console.session-ttl-minutes:30}") long ttlMinutes) {
        this.ttl = Duration.ofMinutes(Math.max(1, ttlMinutes));
    }

    public DatabaseSessionToken createSession(String userId) {
        cleanupExpired();
        String token = UUID.randomUUID().toString().replace("-", "");
        Instant expiresAt = Instant.now().plus(ttl);
        sessions.put(token, new SessionEntry(userId, expiresAt));
        return new DatabaseSessionToken(token, expiresAt);
    }

    public Instant validate(String token, String userId) {
        cleanupExpired();
        if (token == null || token.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Database access token is required");
        }
        SessionEntry entry = sessions.get(token);
        if (entry == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Database access session is invalid or expired");
        }
        if (entry.expiresAt().isBefore(Instant.now())) {
            sessions.remove(token);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Database access session is invalid or expired");
        }
        if (!entry.userId().equals(userId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Database access session belongs to a different user");
        }
        return entry.expiresAt();
    }

    private void cleanupExpired() {
        Instant now = Instant.now();
        sessions.entrySet().removeIf(entry -> entry.getValue().expiresAt().isBefore(now));
    }

    private record SessionEntry(String userId, Instant expiresAt) {
    }
}
