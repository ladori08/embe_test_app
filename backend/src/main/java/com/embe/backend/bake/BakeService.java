package com.embe.backend.bake;

import com.embe.backend.auth.AuthService;
import com.embe.backend.common.ApiException;
import com.embe.backend.ingredient.IngredientService;
import com.embe.backend.ingredient.StockTransactionType;
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
import java.util.List;

@Service
public class BakeService {

    private final BakeRepository bakeRepository;
    private final RecipeService recipeService;
    private final InventoryMutationService inventoryMutationService;
    private final IngredientService ingredientService;
    private final ProductService productService;
    private final AuthService authService;

    public BakeService(
            BakeRepository bakeRepository,
            RecipeService recipeService,
            InventoryMutationService inventoryMutationService,
            IngredientService ingredientService,
            ProductService productService,
            AuthService authService
    ) {
        this.bakeRepository = bakeRepository;
        this.recipeService = recipeService;
        this.inventoryMutationService = inventoryMutationService;
        this.ingredientService = ingredientService;
        this.productService = productService;
        this.authService = authService;
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
        BigDecimal factor = resolveFactor(request, recipe.getYieldQty());
        BigDecimal producedQty = recipe.getYieldQty().multiply(factor);

        List<BakeDeduction> deductions = recipe.getItems().stream().map(item -> deductIngredient(item, factor)).toList();

        inventoryMutationService.addProduct(recipe.getProductId(), producedQty);
        productService.saveStockLog(recipe.getProductId(), ProductStockLogType.IN, producedQty, "Production bake", null, currentUser());

        BakeRecord record = new BakeRecord();
        record.setIdempotencyKey(request.idempotencyKey());
        record.setRecipeId(recipe.getId());
        record.setProductId(recipe.getProductId());
        record.setFactor(factor);
        record.setProducedQty(producedQty);
        record.setDeductions(deductions);
        record.setCreatedAt(Instant.now());
        record.setCreatedBy(currentUser());

        try {
            return toResponse(bakeRepository.save(record));
        } catch (DuplicateKeyException ex) {
            return bakeRepository.findByIdempotencyKey(request.idempotencyKey())
                    .map(this::toResponse)
                    .orElseThrow(() -> ex);
        }
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

    private BakeResponse toResponse(BakeRecord record) {
        return new BakeResponse(
                record.getId(),
                record.getRecipeId(),
                record.getProductId(),
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
