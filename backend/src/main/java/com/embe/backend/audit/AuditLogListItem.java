package com.embe.backend.audit;

import java.time.Instant;

public record AuditLogListItem(
        String id,
        String title,
        String module,
        String action,
        String entityId,
        String actorEmail,
        Instant createdAt
) {
}
