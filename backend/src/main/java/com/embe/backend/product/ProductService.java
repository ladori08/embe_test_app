package com.embe.backend.product;

import com.embe.backend.category.ProductCategoryService;
import com.embe.backend.common.ApiException;
import com.embe.backend.recipe.RecipeRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

@Service
public class ProductService {

    private static final int SKU_PREFIX_LENGTH = 5;
    private static final int SKU_SEQUENCE_DIGITS = 5;
    private static final int SKU_MAX_RETRIES = 1000;
    private static final String SKU_FALLBACK_PREFIX = "ITEMX";

    private final ProductRepository productRepository;
    private final ProductStockLogRepository productStockLogRepository;
    private final ProductCategoryService productCategoryService;
    private final RecipeRepository recipeRepository;

    public ProductService(
            ProductRepository productRepository,
            ProductStockLogRepository productStockLogRepository,
            ProductCategoryService productCategoryService,
            RecipeRepository recipeRepository
    ) {
        this.productRepository = productRepository;
        this.productStockLogRepository = productStockLogRepository;
        this.productCategoryService = productCategoryService;
        this.recipeRepository = recipeRepository;
    }

    public List<ProductResponse> listAll() {
        return productRepository.findAll().stream()
                .sorted(Comparator.comparing(Product::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toResponse)
                .toList();
    }

    public List<ProductResponse> listActive() {
        return productRepository.findByActiveTrueOrderByCreatedAtDesc().stream().map(this::toResponse).toList();
    }

    public ProductResponse getById(String id) {
        return toResponse(getEntity(id));
    }

    public String previewNextSku(String category) {
        String categoryName = productCategoryService.requireExistingCategoryName(category);
        String prefix = buildCategoryPrefix(categoryName);
        int nextSequence = nextSequenceForPrefix(prefix);
        return formatSku(prefix, nextSequence);
    }

    public ProductResponse create(ProductRequest request) {
        String categoryName = productCategoryService.requireExistingCategoryName(request.category());
        Product product = new Product();
        applyCommonFields(product, request, categoryName);
        Instant now = Instant.now();
        product.setCreatedAt(now);
        product.setUpdatedAt(now);

        String prefix = buildCategoryPrefix(categoryName);
        int initialSequence = nextSequenceForPrefix(prefix);

        for (int attempt = 0; attempt < SKU_MAX_RETRIES; attempt++) {
            product.setSku(formatSku(prefix, initialSequence + attempt));
            try {
                Product saved = productRepository.save(product);
                if (request.currentStock().compareTo(BigDecimal.ZERO) > 0) {
                    saveStockLog(saved.getId(), ProductStockLogType.IN, request.currentStock(), "Initial stock", null, "system");
                }
                return toResponse(saved);
            } catch (DataIntegrityViolationException ex) {
                if (!isDuplicateKey(ex)) {
                    throw ex;
                }
                // Retry with next sequence when SKU collision happens concurrently.
            }
        }

        throw new ApiException(HttpStatus.CONFLICT, "Unable to generate unique SKU for this category");
    }

    public ProductResponse update(String id, ProductRequest request) {
        Product product = getEntity(id);
        String categoryName = productCategoryService.requireExistingCategoryNameOrCurrent(request.category(), product.getCategory());
        applyCommonFields(product, request, categoryName);
        product.setUpdatedAt(Instant.now());

        if (Boolean.TRUE.equals(request.regenerateSku())) {
            return saveWithRegeneratedSku(product, categoryName);
        }

        String requestedSku = request.sku() == null ? "" : request.sku().trim().toUpperCase(Locale.ROOT);
        String finalSku = requestedSku.isBlank() ? product.getSku() : requestedSku;
        productRepository.findBySkuIgnoreCase(finalSku)
                .filter(found -> !found.getId().equals(id))
                .ifPresent(existing -> {
                    throw new ApiException(HttpStatus.CONFLICT, "SKU already exists");
                });
        product.setSku(finalSku);
        return saveWithManualSku(product);
    }

    public void delete(String id) {
        Product product = getEntity(id);
        recipeRepository.deleteByProductId(product.getId());
        productRepository.delete(product);
    }

    public String exportStockLogsCsv() {
        List<ProductStockLog> logs = productStockLogRepository.findByOrderByCreatedAtDesc();
        StringBuilder builder = new StringBuilder("id,productId,type,qty,note,relatedOrderId,createdAt,createdBy\n");
        for (ProductStockLog log : logs) {
            builder.append(csv(log.getId())).append(',')
                    .append(csv(log.getProductId())).append(',')
                    .append(csv(log.getType() == null ? null : log.getType().name())).append(',')
                    .append(csv(log.getQty() == null ? null : log.getQty().toPlainString())).append(',')
                    .append(csv(log.getNote())).append(',')
                    .append(csv(log.getRelatedOrderId())).append(',')
                    .append(csv(log.getCreatedAt() == null ? null : log.getCreatedAt().toString())).append(',')
                    .append(csv(log.getCreatedBy())).append('\n');
        }
        return builder.toString();
    }

    public void saveStockLog(String productId, ProductStockLogType type, BigDecimal qty, String note, String relatedOrderId, String createdBy) {
        ProductStockLog log = new ProductStockLog();
        log.setProductId(productId);
        log.setType(type);
        log.setQty(qty);
        log.setNote(note);
        log.setRelatedOrderId(relatedOrderId);
        log.setCreatedAt(Instant.now());
        log.setCreatedBy(createdBy);
        productStockLogRepository.save(log);
    }

    public Product getEntity(String id) {
        return productRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Product not found"));
    }

    private void applyCommonFields(Product product, ProductRequest request, String categoryName) {
        product.setName(request.name().trim());
        product.setCategory(categoryName);
        product.setPrice(request.price());
        product.setCost(request.cost() == null ? BigDecimal.ZERO : request.cost());
        product.setCurrentStock(request.currentStock());
        product.setActive(request.isActive() == null || request.isActive());
        product.setImages(request.images());
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
                .filter(word -> !word.isBlank())
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
            candidate = (candidate + SKU_FALLBACK_PREFIX);
        }
        return candidate.substring(0, SKU_PREFIX_LENGTH);
    }

    private int nextSequenceForPrefix(String prefix) {
        String skuPrefix = prefix + "-";
        return productRepository.findBySkuStartingWith(skuPrefix).stream()
                .map(Product::getSku)
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

    private ProductResponse saveWithRegeneratedSku(Product product, String categoryName) {
        String prefix = buildCategoryPrefix(categoryName);
        int initialSequence = nextSequenceForPrefix(prefix);
        for (int attempt = 0; attempt < SKU_MAX_RETRIES; attempt++) {
            product.setSku(formatSku(prefix, initialSequence + attempt));
            try {
                return toResponse(productRepository.save(product));
            } catch (DataIntegrityViolationException ex) {
                if (!isDuplicateKey(ex)) {
                    throw ex;
                }
            }
        }
        throw new ApiException(HttpStatus.CONFLICT, "Unable to generate unique SKU for this category");
    }

    private ProductResponse saveWithManualSku(Product product) {
        try {
            return toResponse(productRepository.save(product));
        } catch (DataIntegrityViolationException ex) {
            if (isDuplicateKey(ex)) {
                throw new ApiException(HttpStatus.CONFLICT, "SKU already exists");
            }
            throw ex;
        }
    }

    private boolean isDuplicateKey(DataIntegrityViolationException ex) {
        String message = ex.getMessage();
        return message != null && message.toLowerCase(Locale.ROOT).contains("duplicate key");
    }

    private ProductResponse toResponse(Product product) {
        return new ProductResponse(
                product.getId(),
                product.getName(),
                product.getSku(),
                product.getCategory(),
                product.getPrice(),
                product.getCost(),
                product.getCurrentStock(),
                product.getActive(),
                product.getImages(),
                product.getCreatedAt(),
                product.getUpdatedAt()
        );
    }

    private String csv(String value) {
        if (value == null) {
            return "";
        }
        String escaped = value.replace("\"", "\"\"");
        return "\"" + escaped + "\"";
    }
}
