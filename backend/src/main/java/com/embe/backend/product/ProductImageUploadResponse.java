package com.embe.backend.product;

public record ProductImageUploadResponse(
        String fileName,
        String path,
        String url
) {
}
