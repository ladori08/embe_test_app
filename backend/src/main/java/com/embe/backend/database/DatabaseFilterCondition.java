package com.embe.backend.database;

import jakarta.validation.constraints.NotBlank;

public record DatabaseFilterCondition(
        @NotBlank(message = "Filter field is required")
        String field,
        DatabaseFilterOperator operator,
        String value
) {
}
