package com.embe.backend.product;

import com.embe.backend.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class ProductLotService {

    private static final String LEGACY_LOT_PREFIX = "LEGACY-PROD-";

    private final ProductLotRepository productLotRepository;

    public ProductLotService(ProductLotRepository productLotRepository) {
        this.productLotRepository = productLotRepository;
    }

    public ProductLot createLotForProduction(
            String productId,
            BigDecimal producedQty,
            BigDecimal unitCost,
            String bakeRecordId,
            Integer recipeVersion,
            String note,
            Instant producedAt
    ) {
        BigDecimal qty = safeQty(producedQty);
        if (qty.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Produced quantity must be greater than 0");
        }

        BigDecimal normalizedUnitCost = unitCost == null ? BigDecimal.ZERO : unitCost;
        ProductLot lot = new ProductLot();
        lot.setProductId(productId);
        lot.setLotCode(nextLotCode(productId));
        lot.setBakeRecordId(bakeRecordId);
        lot.setRecipeVersion(recipeVersion);
        lot.setProducedQty(qty);
        lot.setRemainingQty(qty);
        lot.setUnitCost(normalizedUnitCost);
        lot.setTotalCost(normalizedUnitCost.multiply(qty));
        lot.setProducedAt(producedAt == null ? Instant.now() : producedAt);
        lot.setNote(note);
        Instant now = Instant.now();
        lot.setCreatedAt(now);
        lot.setUpdatedAt(now);
        return productLotRepository.save(lot);
    }

    public List<ProductLotAllocation> consumeLots(String productId, BigDecimal qty) {
        BigDecimal required = safeQty(qty);
        if (required.compareTo(BigDecimal.ZERO) <= 0) {
            return List.of();
        }

        BigDecimal remaining = required;
        List<ProductLotAllocation> allocations = new ArrayList<>();
        List<ProductLot> lots = productLotRepository.findByProductIdOrderByProducedAtAscCreatedAtAsc(productId);

        for (ProductLot lot : lots) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) {
                break;
            }
            BigDecimal available = safeQty(lot.getRemainingQty());
            if (available.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }

            BigDecimal deducted = available.min(remaining);
            lot.setRemainingQty(available.subtract(deducted));
            lot.setUpdatedAt(Instant.now());
            productLotRepository.save(lot);

            BigDecimal unitCost = lot.getUnitCost();
            BigDecimal subtotal = unitCost == null ? null : unitCost.multiply(deducted);
            allocations.add(new ProductLotAllocation(
                    lot.getLotCode(),
                    deducted,
                    unitCost,
                    subtotal,
                    lot.getProducedAt(),
                    lot.getBakeRecordId()
            ));
            remaining = remaining.subtract(deducted);
        }

        if (remaining.compareTo(BigDecimal.ZERO) > 0) {
            // Backward-compatible fallback for legacy stock that pre-dates lot tracking.
            allocations.add(new ProductLotAllocation(
                    legacyLotCode(productId),
                    remaining,
                    null,
                    null,
                    Instant.now(),
                    "LEGACY_STOCK"
            ));
        }

        return allocations;
    }

    public void restoreLots(String productId, List<ProductLotAllocation> allocations, String note) {
        if (allocations == null || allocations.isEmpty()) {
            return;
        }

        for (ProductLotAllocation allocation : allocations) {
            if (allocation == null || allocation.getQty() == null || allocation.getQty().compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            String lotCode = allocation.getLotCode();
            if (lotCode == null || lotCode.isBlank()) {
                lotCode = legacyLotCode(productId);
            }
            ProductLot lot = productLotRepository.findByProductIdAndLotCode(productId, lotCode).orElse(null);
            if (lot == null) {
                lot = new ProductLot();
                lot.setProductId(productId);
                lot.setLotCode(lotCode);
                lot.setBakeRecordId(allocation.getReference());
                lot.setRecipeVersion(null);
                lot.setProducedQty(allocation.getQty());
                lot.setRemainingQty(allocation.getQty());
                lot.setUnitCost(allocation.getUnitCost());
                BigDecimal totalCost = allocation.getSubtotalCost();
                if (totalCost == null && allocation.getUnitCost() != null) {
                    totalCost = allocation.getUnitCost().multiply(allocation.getQty());
                }
                lot.setTotalCost(totalCost);
                lot.setProducedAt(allocation.getProducedAt() == null ? Instant.now() : allocation.getProducedAt());
                lot.setNote(note);
                Instant now = Instant.now();
                lot.setCreatedAt(now);
                lot.setUpdatedAt(now);
                productLotRepository.save(lot);
                continue;
            }

            lot.setRemainingQty(safeQty(lot.getRemainingQty()).add(allocation.getQty()));
            lot.setUpdatedAt(Instant.now());
            productLotRepository.save(lot);
        }
    }

    public List<ProductLotResponse> listByProductId(String productId) {
        return productLotRepository.findByProductIdOrderByProducedAtDescCreatedAtDesc(productId).stream()
                .map(this::toResponse)
                .toList();
    }

    public BigDecimal estimateCost(List<ProductLotAllocation> allocations) {
        if (allocations == null || allocations.isEmpty()) {
            return BigDecimal.ZERO;
        }
        return allocations.stream()
                .map(ProductLotAllocation::getSubtotalCost)
                .filter(value -> value != null && value.compareTo(BigDecimal.ZERO) > 0)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private ProductLotResponse toResponse(ProductLot lot) {
        return new ProductLotResponse(
                lot.getId(),
                lot.getProductId(),
                lot.getLotCode(),
                lot.getBakeRecordId(),
                lot.getRecipeVersion(),
                lot.getProducedQty(),
                lot.getRemainingQty(),
                lot.getUnitCost(),
                lot.getTotalCost(),
                lot.getProducedAt(),
                lot.getNote(),
                lot.getCreatedAt(),
                lot.getUpdatedAt()
        );
    }

    private BigDecimal safeQty(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private String nextLotCode(String productId) {
        String shortProductId = productId == null ? "UNK" : productId.replace("-", "").toUpperCase();
        if (shortProductId.length() > 6) {
            shortProductId = shortProductId.substring(0, 6);
        }
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase();
        return "PLOT-" + shortProductId + "-" + suffix;
    }

    private String legacyLotCode(String productId) {
        String shortProductId = productId == null ? "UNK" : productId.replace("-", "").toUpperCase();
        if (shortProductId.length() > 6) {
            shortProductId = shortProductId.substring(0, 6);
        }
        return LEGACY_LOT_PREFIX + shortProductId;
    }
}
