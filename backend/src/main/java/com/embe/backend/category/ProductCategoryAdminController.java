package com.embe.backend.category;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/product-categories")
public class ProductCategoryAdminController {

    private final ProductCategoryService categoryService;

    public ProductCategoryAdminController(ProductCategoryService categoryService) {
        this.categoryService = categoryService;
    }

    @GetMapping
    public List<ProductCategoryResponse> list() {
        return categoryService.list();
    }

    @PostMapping
    public ProductCategoryResponse create(@Valid @RequestBody ProductCategoryRequest request) {
        return categoryService.create(request);
    }

    @PutMapping("/{id}")
    public ProductCategoryResponse update(@PathVariable String id, @Valid @RequestBody ProductCategoryRequest request) {
        return categoryService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable String id) {
        categoryService.delete(id);
    }
}
