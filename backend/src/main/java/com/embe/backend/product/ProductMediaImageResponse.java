package com.embe.backend.product;

import java.time.Instant;

public record ProductMediaImageResponse(
        String fileName,
        String path,
        String url,
        long sizeBytes,
        Instant lastModified
) {
}
