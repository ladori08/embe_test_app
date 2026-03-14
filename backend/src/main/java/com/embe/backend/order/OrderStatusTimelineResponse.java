package com.embe.backend.order;

import java.time.Instant;

public record OrderStatusTimelineResponse(
        OrderStatus status,
        Instant changedAt,
        String actorEmail,
        String cancelReason
) {
}
