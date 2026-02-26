package com.embe.backend.recipe;

import com.embe.backend.common.ApiException;
import com.embe.backend.ingredient.Ingredient;
import com.embe.backend.ingredient.IngredientRepository;
import com.embe.backend.product.Product;
import com.embe.backend.product.ProductService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

@Service
public class RecipeService {

    private final RecipeRepository recipeRepository;
    private final IngredientRepository ingredientRepository;
    private final ProductService productService;

    public RecipeService(RecipeRepository recipeRepository, IngredientRepository ingredientRepository, ProductService productService) {
        this.recipeRepository = recipeRepository;
        this.ingredientRepository = ingredientRepository;
        this.productService = productService;
    }

    public List<RecipeResponse> list() {
        return recipeRepository.findAll().stream()
                .sorted(Comparator.comparing(Recipe::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toResponse)
                .toList();
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
        recipe.setCreatedAt(now);
        recipe.setUpdatedAt(now);

        return toResponse(recipeRepository.save(recipe));
    }

    public RecipeResponse update(String id, RecipeRequest request) {
        Recipe recipe = getEntity(id);
        recipeRepository.findByProductId(request.productId())
                .filter(existing -> !existing.getId().equals(id))
                .ifPresent(found -> {
                    throw new ApiException(HttpStatus.CONFLICT, "Recipe for product already exists");
                });

        validateProductAndIngredients(request);
        apply(recipe, request);
        recipe.setUpdatedAt(Instant.now());
        return toResponse(recipeRepository.save(recipe));
    }

    public void delete(String id) {
        recipeRepository.delete(getEntity(id));
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

    private RecipeResponse toResponse(Recipe recipe) {
        Product product = productService.getEntity(recipe.getProductId());
        List<RecipeIngredientResponse> items = recipe.getItems().stream().map(item -> {
            Ingredient ingredient = ingredientRepository.findById(item.getIngredientId())
                    .orElse(null);
            return new RecipeIngredientResponse(
                    item.getIngredientId(),
                    ingredient == null ? "Unknown ingredient" : ingredient.getName(),
                    item.getQtyPerBatch()
            );
        }).toList();

        return new RecipeResponse(
                recipe.getId(),
                recipe.getProductId(),
                product.getName(),
                recipe.getYieldQty(),
                items,
                recipe.getCreatedAt(),
                recipe.getUpdatedAt()
        );
    }
}
