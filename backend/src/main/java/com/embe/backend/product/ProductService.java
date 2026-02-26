package com.embe.backend.product;

import com.embe.backend.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;

@Service
public class ProductService {

    private final ProductRepository productRepository;
    private final ProductStockLogRepository productStockLogRepository;

    public ProductService(ProductRepository productRepository, ProductStockLogRepository productStockLogRepository) {
        this.productRepository = productRepository;
        this.productStockLogRepository = productStockLogRepository;
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

    public ProductResponse create(ProductRequest request) {
        productRepository.findBySkuIgnoreCase(request.sku()).ifPresent(existing -> {
            throw new ApiException(HttpStatus.CONFLICT, "SKU already exists");
        });

        Product product = new Product();
        apply(product, request);
        Instant now = Instant.now();
        product.setCreatedAt(now);
        product.setUpdatedAt(now);

        Product saved = productRepository.save(product);
        if (request.currentStock().compareTo(BigDecimal.ZERO) > 0) {
            saveStockLog(saved.getId(), ProductStockLogType.IN, request.currentStock(), "Initial stock", null, "system");
        }
        return toResponse(saved);
    }

    public ProductResponse update(String id, ProductRequest request) {
        Product product = getEntity(id);
        productRepository.findBySkuIgnoreCase(request.sku())
                .filter(found -> !found.getId().equals(id))
                .ifPresent(existing -> {
                    throw new ApiException(HttpStatus.CONFLICT, "SKU already exists");
                });

        apply(product, request);
        product.setUpdatedAt(Instant.now());
        return toResponse(productRepository.save(product));
    }

    public void delete(String id) {
        Product product = getEntity(id);
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

    private void apply(Product product, ProductRequest request) {
        product.setName(request.name().trim());
        product.setSku(request.sku().trim().toUpperCase());
        product.setCategory(request.category().trim());
        product.setPrice(request.price());
        product.setCost(request.cost() == null ? BigDecimal.ZERO : request.cost());
        product.setCurrentStock(request.currentStock());
        product.setActive(request.isActive() == null || request.isActive());
        product.setImages(request.images());
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
