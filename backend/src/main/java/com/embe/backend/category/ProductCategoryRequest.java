package com.embe.backend.category;

import jakarta.validation.constraints.NotBlank;

public record ProductCategoryRequest(
        @NotBlank(message = "Category name is required")
        String name
) {
}
