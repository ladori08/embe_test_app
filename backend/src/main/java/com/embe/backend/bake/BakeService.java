package com.embe.backend.bake;

import com.embe.backend.audit.AuditAction;
import com.embe.backend.audit.AuditLogService;
import com.embe.backend.audit.AuditModule;
import com.embe.backend.auth.AuthService;
import com.embe.backend.common.ApiException;
import com.embe.backend.ingredient.Ingredient;
import com.embe.backend.ingredient.IngredientService;
import com.embe.backend.ingredient.StockTransactionType;
import com.embe.backend.product.Product;
import com.embe.backend.product.ProductStockLogType;
import com.embe.backend.product.ProductService;
import com.embe.backend.recipe.Recipe;
import com.embe.backend.recipe.RecipeItem;
import com.embe.backend.recipe.RecipeService;
import com.embe.backend.stock.InventoryMutationService;
import com.mongodb.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class BakeService {

    private final BakeRepository bakeRepository;
    private final RecipeService recipeService;
    private final InventoryMutationService inventoryMutationService;
    private final IngredientService ingredientService;
    private final ProductService productService;
    private final AuthService authService;
    private final AuditLogService auditLogService;

    public BakeService(
            BakeRepository bakeRepository,
            RecipeService recipeService,
            InventoryMutationService inventoryMutationService,
            IngredientService ingredientService,
            ProductService productService,
            AuthService authService,
            AuditLogService auditLogService
    ) {
        this.bakeRepository = bakeRepository;
        this.recipeService = recipeService;
        this.inventoryMutationService = inventoryMutationService;
        this.ingredientService = ingredientService;
        this.productService = productService;
        this.authService = authService;
        this.auditLogService = auditLogService;
    }

    public List<BakeResponse> list() {
        return bakeRepository.findByOrderByCreatedAtDesc().stream().map(this::toResponse).toList();
    }

    @Transactional
    public BakeResponse produce(BakeRequest request) {
        BakeRecord existing = bakeRepository.findByIdempotencyKey(request.idempotencyKey()).orElse(null);
        if (existing != null) {
            return toResponse(existing);
        }

        Recipe recipe = recipeService.getEntity(request.recipeId());
        List<RecipeItem> appliedRecipeItems = resolveAppliedItems(recipe, request.overrideItems());
        boolean customOverride = request.overrideItems() != null && !request.overrideItems().isEmpty();

        BigDecimal factor = resolveFactor(request, recipe.getYieldQty());
        BigDecimal producedQty = recipe.getYieldQty().multiply(factor);

        List<BakeDeduction> deductions = appliedRecipeItems.stream().map(item -> deductIngredient(item, factor)).toList();

        inventoryMutationService.addProduct(recipe.getProductId(), producedQty);
        productService.saveStockLog(recipe.getProductId(), ProductStockLogType.IN, producedQty, "Production bake", null, currentUser());

        BakeRecord record = new BakeRecord();
        record.setIdempotencyKey(request.idempotencyKey());
        record.setRecipeId(recipe.getId());
        record.setProductId(recipe.getProductId());
        record.setRecipeVersion(normalizeRecipeVersion(recipe.getVersion()));
        record.setCustomOverride(customOverride);
        record.setAppliedItems(toAppliedSnapshot(appliedRecipeItems));
        record.setFactor(factor);
        record.setProducedQty(producedQty);
        record.setDeductions(deductions);
        record.setCreatedAt(Instant.now());
        record.setCreatedBy(currentUser());

        BakeRecord saved;
        try {
            saved = bakeRepository.save(record);
        } catch (DuplicateKeyException ex) {
            return bakeRepository.findByIdempotencyKey(request.idempotencyKey())
                    .map(this::toResponse)
                    .orElseThrow(() -> ex);
        }

        Product product = productService.getEntity(recipe.getProductId());
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("recipeVersion", normalizeRecipeVersion(recipe.getVersion()));
        metadata.put("customOverride", customOverride);
        metadata.put("factor", factor);
        metadata.put("producedQty", producedQty);

        auditLogService.record(
                AuditModule.PRODUCTION,
                AuditAction.PRODUCE,
                "Produced " + producedQty.toPlainString() + " of " + product.getName(),
                saved.getId(),
                null,
                toResponse(saved),
                metadata
        );

        return toResponse(saved);
    }

    private List<RecipeItem> resolveAppliedItems(Recipe recipe, List<BakeRecipeOverrideItem> overrides) {
        List<RecipeItem> baseItems = recipe.getItems();
        if (overrides == null || overrides.isEmpty()) {
            return cloneRecipeItems(baseItems);
        }

        Map<String, BigDecimal> overrideQtyByIngredient = new HashMap<>();
        for (BakeRecipeOverrideItem override : overrides) {
            BigDecimal previous = overrideQtyByIngredient.put(override.ingredientId(), override.qtyPerBatch());
            if (previous != null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Duplicate override ingredient: " + override.ingredientId());
            }
        }

        Map<String, RecipeItem> baseItemByIngredient = baseItems.stream()
                .collect(HashMap::new, (map, item) -> map.put(item.getIngredientId(), item), HashMap::putAll);

        for (String ingredientId : overrideQtyByIngredient.keySet()) {
            if (!baseItemByIngredient.containsKey(ingredientId)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Override ingredient is not part of recipe: " + ingredientId);
            }
        }

        return baseItems.stream().map(item -> {
            RecipeItem applied = new RecipeItem();
            applied.setIngredientId(item.getIngredientId());
            applied.setQtyPerBatch(overrideQtyByIngredient.getOrDefault(item.getIngredientId(), item.getQtyPerBatch()));
            return applied;
        }).toList();
    }

    private List<RecipeItem> cloneRecipeItems(List<RecipeItem> items) {
        return items.stream().map(item -> {
            RecipeItem clone = new RecipeItem();
            clone.setIngredientId(item.getIngredientId());
            clone.setQtyPerBatch(item.getQtyPerBatch());
            return clone;
        }).toList();
    }

    private List<BakeAppliedItem> toAppliedSnapshot(List<RecipeItem> recipeItems) {
        return recipeItems.stream().map(item -> {
            Ingredient ingredient = ingredientService.getEntity(item.getIngredientId());
            BakeAppliedItem snapshot = new BakeAppliedItem();
            snapshot.setIngredientId(item.getIngredientId());
            snapshot.setIngredientName(ingredient.getName());
            snapshot.setUnit(ingredient.getUnit());
            snapshot.setQtyPerBatch(item.getQtyPerBatch());
            return snapshot;
        }).toList();
    }

    private BakeDeduction deductIngredient(RecipeItem item, BigDecimal factor) {
        BigDecimal required = item.getQtyPerBatch().multiply(factor);
        boolean ok = inventoryMutationService.deductIngredientIfEnough(item.getIngredientId(), required);
        if (!ok) {
            throw new ApiException(HttpStatus.CONFLICT, "Insufficient ingredient stock for ingredient " + item.getIngredientId());
        }
        ingredientService.recordStockTransaction(item.getIngredientId(), StockTransactionType.OUT, required, null, "Production deduction", currentUser());

        BakeDeduction deduction = new BakeDeduction();
        deduction.setIngredientId(item.getIngredientId());
        deduction.setQty(required);
        return deduction;
    }

    private BigDecimal resolveFactor(BakeRequest request, BigDecimal yieldQty) {
        if (request.batchFactor() != null) {
            return request.batchFactor();
        }
        if (request.bakeQuantity() != null) {
            return request.bakeQuantity().divide(yieldQty, 6, RoundingMode.HALF_UP);
        }
        throw new ApiException(HttpStatus.BAD_REQUEST, "Either batchFactor or bakeQuantity is required");
    }

    private int normalizeRecipeVersion(Integer recipeVersion) {
        return recipeVersion == null || recipeVersion < 1 ? 1 : recipeVersion;
    }

    private BakeResponse toResponse(BakeRecord record) {
        return new BakeResponse(
                record.getId(),
                record.getRecipeId(),
                record.getProductId(),
                normalizeRecipeVersion(record.getRecipeVersion()),
                Boolean.TRUE.equals(record.getCustomOverride()),
                record.getAppliedItems() == null ? List.of() : record.getAppliedItems(),
                record.getFactor(),
                record.getProducedQty(),
                record.getDeductions(),
                record.getCreatedAt(),
                record.getCreatedBy()
        );
    }

    private String currentUser() {
        try {
            return authService.currentUserId();
        } catch (Exception ignored) {
            return "system";
        }
    }
}
