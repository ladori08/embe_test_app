package com.embe.backend.database;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import java.util.List;

public record DatabaseQueryRequest(
        @NotBlank(message = "Collection is required")
        String collection,
        List<@Valid DatabaseFilterCondition> filters,
        Integer page,
        Integer pageSize,
        String sortField,
        String sortDirection
) {
    public DatabaseQueryRequest {
        filters = filters == null ? List.of() : List.copyOf(filters);
        page = page == null ? 1 : page;
        pageSize = pageSize == null ? 50 : pageSize;
    }
}
