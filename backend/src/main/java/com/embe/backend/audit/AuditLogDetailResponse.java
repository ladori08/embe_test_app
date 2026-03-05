package com.embe.backend.audit;

import java.time.Instant;
import java.util.Map;

public record AuditLogDetailResponse(
        String id,
        String title,
        String module,
        String action,
        String entityId,
        String actorId,
        String actorEmail,
        Map<String, Object> beforeData,
        Map<String, Object> afterData,
        Map<String, Object> metadata,
        Instant createdAt
) {
}
