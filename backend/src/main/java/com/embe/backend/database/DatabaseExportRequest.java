package com.embe.backend.database;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import java.util.List;

public record DatabaseExportRequest(
        @NotBlank(message = "Collection is required")
        String collection,
        List<@Valid DatabaseFilterCondition> filters,
        String sortField,
        String sortDirection
) {
    public DatabaseExportRequest {
        filters = filters == null ? List.of() : List.copyOf(filters);
    }
}
