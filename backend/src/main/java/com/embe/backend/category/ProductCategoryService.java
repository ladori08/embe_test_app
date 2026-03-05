package com.embe.backend.category;

import com.embe.backend.audit.AuditAction;
import com.embe.backend.audit.AuditLogService;
import com.embe.backend.audit.AuditModule;
import com.embe.backend.common.ApiException;
import com.embe.backend.product.Product;
import com.embe.backend.product.ProductRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class ProductCategoryService {

    private static final int SKU_PREFIX_LENGTH = 5;
    private static final int SKU_SEQUENCE_DIGITS = 5;
    private static final int SKU_MAX_RETRIES = 1000;
    private static final String SKU_FALLBACK_PREFIX = "ITEMX";

    private final ProductCategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final AuditLogService auditLogService;

    public ProductCategoryService(
            ProductCategoryRepository categoryRepository,
            ProductRepository productRepository,
            AuditLogService auditLogService
    ) {
        this.categoryRepository = categoryRepository;
        this.productRepository = productRepository;
        this.auditLogService = auditLogService;
    }

    public List<ProductCategoryResponse> list() {
        backfillCategoriesFromProducts();
        return categoryRepository.findAllByOrderByNameAsc().stream()
                .sorted(Comparator.comparing(ProductCategory::getName, String.CASE_INSENSITIVE_ORDER))
                .map(this::toResponse)
                .toList();
    }

    public ProductCategoryResponse create(ProductCategoryRequest request) {
        String normalizedName = normalizeDisplayName(request.name());
        String nameKey = toNameKey(normalizedName);
        ensureUniqueName(nameKey, null);

        ProductCategory category = new ProductCategory();
        Instant now = Instant.now();
        category.setName(normalizedName);
        category.setNameKey(nameKey);
        category.setLegacySkus(List.of());
        category.setCreatedAt(now);
        category.setUpdatedAt(now);

        ProductCategory saved = saveWithGeneratedSku(category, buildCategoryPrefix(normalizedName));
        ProductCategoryResponse response = toResponse(saved);
        auditLogService.record(
                AuditModule.CATEGORY,
                AuditAction.CREATE,
                "Created category " + response.name(),
                response.id(),
                null,
                response,
                java.util.Map.of("sku", response.sku())
        );
        return response;
    }

    public ProductCategoryResponse update(String id, ProductCategoryRequest request) {
        ProductCategory category = getEntity(id);
        ProductCategoryResponse before = toResponse(category);
        String oldName = category.getName();
        String oldSku = category.getSku();

        String normalizedName = normalizeDisplayName(request.name());
        String nameKey = toNameKey(normalizedName);
        ensureUniqueName(nameKey, id);

        String nextPrefix = buildCategoryPrefix(normalizedName);
        String currentPrefix = extractPrefix(oldSku);
        boolean skuNeedsUpdate = !nextPrefix.equals(currentPrefix);

        category.setName(normalizedName);
        category.setNameKey(nameKey);
        category.setUpdatedAt(Instant.now());

        ProductCategory saved;
        if (skuNeedsUpdate) {
            appendLegacySku(category, oldSku);
            saved = saveWithGeneratedSku(category, nextPrefix);
        } else {
            saved = categoryRepository.save(category);
        }

        if (!oldName.equals(normalizedName)) {
            renameCategoryForProducts(oldName, normalizedName);
        }

        ProductCategoryResponse after = toResponse(saved);
        boolean skuChanged = oldSku == null || !oldSku.equalsIgnoreCase(after.sku());
        auditLogService.record(
                AuditModule.CATEGORY,
                AuditAction.UPDATE,
                "Updated category " + after.name(),
                after.id(),
                before,
                after,
                java.util.Map.of("skuChanged", skuChanged)
        );
        return after;
    }

    public void delete(String id) {
        ProductCategory category = getEntity(id);
        ProductCategoryResponse before = toResponse(category);
        long linkedProducts = productRepository.countByCategoryIgnoreCase(category.getName());
        if (linkedProducts > 0) {
            throw new ApiException(HttpStatus.CONFLICT, "Category is used by existing products and cannot be deleted");
        }
        categoryRepository.delete(category);
        auditLogService.record(
                AuditModule.CATEGORY,
                AuditAction.DELETE,
                "Deleted category " + before.name(),
                before.id(),
                before,
                null,
                java.util.Map.of("sku", before.sku())
        );
    }

    public String requireExistingCategoryName(String category) {
        String normalized = normalizeDisplayName(category);
        String nameKey = toNameKey(normalized);
        return categoryRepository.findByNameKey(nameKey)
                .map(ProductCategory::getName)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Category does not exist"));
    }

    public String requireExistingCategoryNameOrCurrent(String category, String currentCategory) {
        String normalized = normalizeDisplayName(category);
        String nameKey = toNameKey(normalized);
        ProductCategory existing = categoryRepository.findByNameKey(nameKey).orElse(null);
        if (existing != null) {
            return existing.getName();
        }
        if (currentCategory != null && currentCategory.trim().equalsIgnoreCase(normalized)) {
            return currentCategory.trim();
        }
        throw new ApiException(HttpStatus.BAD_REQUEST, "Category does not exist");
    }

    private ProductCategory saveWithGeneratedSku(ProductCategory category, String prefix) {
        int initialSequence = nextSequenceForPrefix(prefix);
        for (int attempt = 0; attempt < SKU_MAX_RETRIES; attempt++) {
            category.setSku(formatSku(prefix, initialSequence + attempt));
            try {
                return categoryRepository.save(category);
            } catch (DataIntegrityViolationException ex) {
                if (!isDuplicateKey(ex)) {
                    throw ex;
                }
            }
        }
        throw new ApiException(HttpStatus.CONFLICT, "Unable to generate unique category SKU");
    }

    private void renameCategoryForProducts(String oldName, String newName) {
        List<Product> products = productRepository.findByCategoryIgnoreCase(oldName);
        if (products.isEmpty()) {
            return;
        }
        Instant now = Instant.now();
        for (Product product : products) {
            product.setCategory(newName);
            product.setUpdatedAt(now);
        }
        productRepository.saveAll(products);
    }

    private void backfillCategoriesFromProducts() {
        Set<String> productCategories = new LinkedHashSet<>();
        for (Product product : productRepository.findAll()) {
            if (product.getCategory() == null || product.getCategory().isBlank()) {
                continue;
            }
            productCategories.add(normalizeDisplayName(product.getCategory()));
        }

        for (String categoryName : productCategories) {
            String nameKey = toNameKey(categoryName);
            if (categoryRepository.findByNameKey(nameKey).isPresent()) {
                continue;
            }

            ProductCategory category = new ProductCategory();
            Instant now = Instant.now();
            category.setName(categoryName);
            category.setNameKey(nameKey);
            category.setLegacySkus(List.of());
            category.setCreatedAt(now);
            category.setUpdatedAt(now);
            saveWithGeneratedSku(category, buildCategoryPrefix(categoryName));
        }
    }

    private ProductCategory getEntity(String id) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Category not found"));
    }

    private void ensureUniqueName(String nameKey, String currentId) {
        categoryRepository.findByNameKey(nameKey)
                .filter(existing -> currentId == null || !existing.getId().equals(currentId))
                .ifPresent(existing -> {
                    throw new ApiException(HttpStatus.CONFLICT, "Category name already exists");
                });
    }

    private void appendLegacySku(ProductCategory category, String oldSku) {
        if (oldSku == null || oldSku.isBlank()) {
            return;
        }
        List<String> currentLegacy = category.getLegacySkus() == null ? new ArrayList<>() : new ArrayList<>(category.getLegacySkus());
        boolean alreadyPresent = currentLegacy.stream().anyMatch(item -> item.equalsIgnoreCase(oldSku));
        if (!alreadyPresent) {
            currentLegacy.add(oldSku);
            category.setLegacySkus(currentLegacy);
        }
    }

    private String normalizeDisplayName(String name) {
        String normalized = name == null ? "" : name.trim().replaceAll("\\s+", " ");
        if (normalized.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Category name is required");
        }
        return normalized;
    }

    private String toNameKey(String name) {
        return normalizeDisplayName(name).toLowerCase(Locale.ROOT);
    }

    private String buildCategoryPrefix(String category) {
        String normalized = Normalizer.normalize(category == null ? "" : category, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replace("Đ", "D")
                .replace("đ", "d")
                .toUpperCase(Locale.ROOT);

        List<String> words = java.util.Arrays.stream(normalized.split("[^A-Z0-9]+"))
                .filter(part -> !part.isBlank())
                .toList();

        if (words.isEmpty()) {
            return SKU_FALLBACK_PREFIX;
        }

        String initials = words.stream()
                .map(word -> word.substring(0, 1))
                .reduce("", String::concat);

        String remainder = words.stream()
                .map(word -> word.length() > 1 ? word.substring(1) : "")
                .reduce("", String::concat);

        String candidate = (initials + remainder).replaceAll("[^A-Z0-9]", "");
        if (candidate.isBlank()) {
            candidate = words.stream().reduce("", String::concat);
        }
        if (candidate.length() < SKU_PREFIX_LENGTH) {
            candidate = candidate + SKU_FALLBACK_PREFIX;
        }
        return candidate.substring(0, SKU_PREFIX_LENGTH);
    }

    private int nextSequenceForPrefix(String prefix) {
        String skuPrefix = prefix + "-";
        return categoryRepository.findBySkuStartingWith(skuPrefix).stream()
                .map(ProductCategory::getSku)
                .mapToInt(sku -> extractSequence(sku, skuPrefix))
                .max()
                .orElse(0) + 1;
    }

    private int extractSequence(String sku, String skuPrefix) {
        if (sku == null || !sku.startsWith(skuPrefix)) {
            return 0;
        }
        String suffix = sku.substring(skuPrefix.length());
        if (!suffix.matches("\\d{" + SKU_SEQUENCE_DIGITS + "}")) {
            return 0;
        }
        return Integer.parseInt(suffix);
    }

    private String formatSku(String prefix, int sequence) {
        return prefix + "-" + String.format("%0" + SKU_SEQUENCE_DIGITS + "d", sequence);
    }

    private String extractPrefix(String sku) {
        if (sku == null || sku.isBlank() || !sku.contains("-")) {
            return "";
        }
        return sku.substring(0, sku.indexOf('-')).toUpperCase(Locale.ROOT);
    }

    private boolean isDuplicateKey(DataIntegrityViolationException ex) {
        String message = ex.getMessage();
        return message != null && message.toLowerCase(Locale.ROOT).contains("duplicate key");
    }

    private ProductCategoryResponse toResponse(ProductCategory category) {
        return new ProductCategoryResponse(
                category.getId(),
                category.getName(),
                category.getSku(),
                category.getLegacySkus() == null ? List.of() : List.copyOf(category.getLegacySkus()),
                category.getCreatedAt(),
                category.getUpdatedAt()
        );
    }
}
