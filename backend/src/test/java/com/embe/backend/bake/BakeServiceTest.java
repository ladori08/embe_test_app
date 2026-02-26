package com.embe.backend.bake;

import com.embe.backend.auth.AuthService;
import com.embe.backend.common.ApiException;
import com.embe.backend.ingredient.IngredientService;
import com.embe.backend.product.ProductService;
import com.embe.backend.recipe.Recipe;
import com.embe.backend.recipe.RecipeItem;
import com.embe.backend.recipe.RecipeService;
import com.embe.backend.stock.InventoryMutationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BakeServiceTest {

    @Mock
    private BakeRepository bakeRepository;
    @Mock
    private RecipeService recipeService;
    @Mock
    private InventoryMutationService inventoryMutationService;
    @Mock
    private IngredientService ingredientService;
    @Mock
    private ProductService productService;
    @Mock
    private AuthService authService;

    private BakeService bakeService;

    @BeforeEach
    void setUp() {
        bakeService = new BakeService(bakeRepository, recipeService, inventoryMutationService, ingredientService, productService, authService);
    }

    @Test
    void shouldReturnExistingBakeForSameIdempotencyKey() {
        BakeRecord existing = new BakeRecord();
        existing.setId("bake-1");
        existing.setIdempotencyKey("idem-1");
        existing.setRecipeId("recipe-1");
        existing.setProductId("product-1");
        existing.setFactor(new BigDecimal("1"));
        existing.setProducedQty(new BigDecimal("10"));
        existing.setCreatedAt(Instant.now());
        existing.setCreatedBy("u1");

        when(bakeRepository.findByIdempotencyKey("idem-1")).thenReturn(Optional.of(existing));

        BakeResponse response = bakeService.produce(new BakeRequest("recipe-1", "idem-1", new BigDecimal("1"), null));

        assertEquals("bake-1", response.id());
        verifyNoInteractions(recipeService, inventoryMutationService, ingredientService, productService);
    }

    @Test
    void shouldFailWhenIngredientStockInsufficient() {
        Recipe recipe = new Recipe();
        recipe.setId("recipe-1");
        recipe.setProductId("product-1");
        recipe.setYieldQty(new BigDecimal("5"));

        RecipeItem item = new RecipeItem();
        item.setIngredientId("ing-1");
        item.setQtyPerBatch(new BigDecimal("2"));
        recipe.setItems(List.of(item));

        when(bakeRepository.findByIdempotencyKey("idem-2")).thenReturn(Optional.empty());
        when(recipeService.getEntity("recipe-1")).thenReturn(recipe);
        when(inventoryMutationService.deductIngredientIfEnough(eq("ing-1"), any(BigDecimal.class))).thenReturn(false);

        assertThrows(ApiException.class, () -> bakeService.produce(new BakeRequest("recipe-1", "idem-2", new BigDecimal("1"), null)));
        verify(bakeRepository, never()).save(any());
    }
}
