package com.embe.backend.recipe;

import com.embe.backend.audit.AuditAction;
import com.embe.backend.audit.AuditLogService;
import com.embe.backend.audit.AuditModule;
import com.embe.backend.auth.AuthService;
import com.embe.backend.common.ApiException;
import com.embe.backend.ingredient.Ingredient;
import com.embe.backend.ingredient.IngredientRepository;
import com.embe.backend.product.Product;
import com.embe.backend.product.ProductService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class RecipeService {

    private final RecipeRepository recipeRepository;
    private final RecipeRevisionRepository recipeRevisionRepository;
    private final IngredientRepository ingredientRepository;
    private final ProductService productService;
    private final AuditLogService auditLogService;
    private final AuthService authService;

    public RecipeService(
            RecipeRepository recipeRepository,
            RecipeRevisionRepository recipeRevisionRepository,
            IngredientRepository ingredientRepository,
            ProductService productService,
            AuditLogService auditLogService,
            AuthService authService
    ) {
        this.recipeRepository = recipeRepository;
        this.recipeRevisionRepository = recipeRevisionRepository;
        this.ingredientRepository = ingredientRepository;
        this.productService = productService;
        this.auditLogService = auditLogService;
        this.authService = authService;
    }

    public List<RecipeResponse> list() {
        List<Recipe> recipes = recipeRepository.findAll().stream()
                .sorted(Comparator.comparing(Recipe::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();

        List<RecipeResponse> responses = new ArrayList<>();
        List<String> orphanRecipeIds = new ArrayList<>();
        List<Recipe> versionBackfills = new ArrayList<>();

        for (Recipe recipe : recipes) {
            Product product;
            try {
                product = productService.getEntity(recipe.getProductId());
            } catch (ApiException ex) {
                if (ex.getStatus() == HttpStatus.NOT_FOUND) {
                    orphanRecipeIds.add(recipe.getId());
                    continue;
                }
                throw ex;
            }

            int normalizedVersion = normalizeVersion(recipe);
            if (recipe.getVersion() == null || recipe.getVersion() != normalizedVersion) {
                recipe.setVersion(normalizedVersion);
                recipe.setUpdatedAt(Instant.now());
                versionBackfills.add(recipe);
            }

            responses.add(toResponse(recipe, product));
        }

        if (!orphanRecipeIds.isEmpty()) {
            recipeRepository.deleteAllById(orphanRecipeIds);
        }
        if (!versionBackfills.isEmpty()) {
            recipeRepository.saveAll(versionBackfills);
        }

        return responses;
    }

    public RecipeResponse get(String id) {
        return toResponse(getEntity(id));
    }

    public RecipeResponse create(RecipeRequest request) {
        recipeRepository.findByProductId(request.productId()).ifPresent(found -> {
            throw new ApiException(HttpStatus.CONFLICT, "Recipe for product already exists");
        });

        validateProductAndIngredients(request);

        Recipe recipe = new Recipe();
        apply(recipe, request);
        Instant now = Instant.now();
        recipe.setVersion(1);
        recipe.setCreatedAt(now);
        recipe.setUpdatedAt(now);

        Recipe saved = recipeRepository.save(recipe);
        saveRevision(saved, "CREATE");
        RecipeResponse response = toResponse(saved);

        auditLogService.record(
                AuditModule.RECIPE,
                AuditAction.CREATE,
                "Created recipe for " + response.productName(),
                saved.getId(),
                null,
                response,
                Map.of("version", response.version())
        );

        return response;
    }

    public RecipeResponse update(String id, RecipeRequest request) {
        Recipe recipe = getEntity(id);
        RecipeResponse before = toResponse(recipe);

        recipeRepository.findByProductId(request.productId())
                .filter(existing -> !existing.getId().equals(id))
                .ifPresent(found -> {
                    throw new ApiException(HttpStatus.CONFLICT, "Recipe for product already exists");
                });

        validateProductAndIngredients(request);
        int previousVersion = normalizeVersion(recipe);
        ensureBaselineRevision(recipe, previousVersion);
        apply(recipe, request);
        recipe.setVersion(previousVersion + 1);
        recipe.setUpdatedAt(Instant.now());

        Recipe saved = recipeRepository.save(recipe);
        saveRevision(saved, "UPDATE");
        RecipeResponse after = toResponse(saved);

        Map<String, Object> metadata = new HashMap<>();
        metadata.put("fromVersion", previousVersion);
        metadata.put("toVersion", after.version());

        auditLogService.record(
                AuditModule.RECIPE,
                AuditAction.UPDATE,
                "Updated recipe for " + after.productName() + " (v" + after.version() + ")",
                saved.getId(),
                before,
                after,
                metadata
        );

        return after;
    }

    public void delete(String id) {
        Recipe recipe = getEntity(id);
        RecipeResponse before = toResponse(recipe);
        recipeRepository.delete(recipe);

        auditLogService.record(
                AuditModule.RECIPE,
                AuditAction.DELETE,
                "Deleted recipe for " + before.productName(),
                recipe.getId(),
                before,
                null,
                Map.of("version", before.version())
        );
    }

    public Recipe getEntity(String id) {
        return recipeRepository.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Recipe not found"));
    }

    private void validateProductAndIngredients(RecipeRequest request) {
        productService.getEntity(request.productId());
        for (RecipeIngredientRequest item : request.items()) {
            ingredientRepository.findById(item.ingredientId())
                    .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Ingredient not found: " + item.ingredientId()));
        }
    }

    private void apply(Recipe recipe, RecipeRequest request) {
        recipe.setProductId(request.productId());
        recipe.setYieldQty(request.yieldQty());
        recipe.setItems(request.items().stream().map(item -> {
            RecipeItem recipeItem = new RecipeItem();
            recipeItem.setIngredientId(item.ingredientId());
            recipeItem.setQtyPerBatch(item.qtyPerBatch());
            return recipeItem;
        }).toList());
    }

    private void saveRevision(Recipe recipe, String changeType) {
        RecipeRevision revision = new RecipeRevision();
        revision.setRecipeId(recipe.getId());
        revision.setProductId(recipe.getProductId());
        revision.setVersion(normalizeVersion(recipe));
        revision.setYieldQty(recipe.getYieldQty());
        revision.setItems(cloneItems(recipe.getItems()));
        revision.setChangedAt(Instant.now());
        revision.setChangedBy(currentUser());
        revision.setChangeType(changeType);
        recipeRevisionRepository.save(revision);
    }

    private void ensureBaselineRevision(Recipe recipe, int version) {
        if (recipeRevisionRepository.existsByRecipeIdAndVersion(recipe.getId(), version)) {
            return;
        }
        saveRevision(recipe, "BASELINE");
    }

    private List<RecipeItem> cloneItems(List<RecipeItem> items) {
        if (items == null) {
            return List.of();
        }
        return items.stream().map(item -> {
            RecipeItem clone = new RecipeItem();
            clone.setIngredientId(item.getIngredientId());
            clone.setQtyPerBatch(item.getQtyPerBatch());
            return clone;
        }).toList();
    }

    private int normalizeVersion(Recipe recipe) {
        Integer version = recipe.getVersion();
        return version == null || version < 1 ? 1 : version;
    }

    private RecipeResponse toResponse(Recipe recipe) {
        Product product = productService.getEntity(recipe.getProductId());
        return toResponse(recipe, product);
    }

    private RecipeResponse toResponse(Recipe recipe, Product product) {
        List<RecipeIngredientResponse> items = recipe.getItems().stream().map(item -> {
            Ingredient ingredient = ingredientRepository.findById(item.getIngredientId())
                    .orElse(null);
            return new RecipeIngredientResponse(
                    item.getIngredientId(),
                    ingredient == null ? "Unknown ingredient" : ingredient.getName(),
                    ingredient == null ? null : ingredient.getUnit(),
                    item.getQtyPerBatch()
            );
        }).toList();

        return new RecipeResponse(
                recipe.getId(),
                recipe.getProductId(),
                product.getName(),
                normalizeVersion(recipe),
                recipe.getYieldQty(),
                items,
                recipe.getCreatedAt(),
                recipe.getUpdatedAt()
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
