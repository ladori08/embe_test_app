package com.embe.backend.seed;

import com.embe.backend.ingredient.Ingredient;
import com.embe.backend.ingredient.IngredientRepository;
import com.embe.backend.product.Product;
import com.embe.backend.product.ProductRepository;
import com.embe.backend.recipe.Recipe;
import com.embe.backend.recipe.RecipeItem;
import com.embe.backend.recipe.RecipeRepository;
import com.embe.backend.user.Role;
import com.embe.backend.user.UserAccount;
import com.embe.backend.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;

@Configuration
public class SeedDataInitializer {

    private static final Logger log = LoggerFactory.getLogger(SeedDataInitializer.class);

    @Bean
    CommandLineRunner seedRunner(
            UserRepository userRepository,
            IngredientRepository ingredientRepository,
            ProductRepository productRepository,
            RecipeRepository recipeRepository,
            PasswordEncoder passwordEncoder
    ) {
        return args -> {
            seedUsers(userRepository, passwordEncoder);
            seedCatalog(ingredientRepository, productRepository, recipeRepository);
            log.info("Seed data completed");
        };
    }

    private void seedUsers(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        upsertUser(userRepository, passwordEncoder, "admin@example.com", "Admin", "Admin123!", Set.of(Role.ADMIN));
        upsertUser(userRepository, passwordEncoder, "client@example.com", "Client", "Client123!", Set.of(Role.CLIENT));
    }

    private void upsertUser(UserRepository repository, PasswordEncoder encoder, String email, String fullName, String password, Set<Role> roles) {
        if (repository.findByEmailIgnoreCase(email).isPresent()) {
            return;
        }
        UserAccount user = new UserAccount();
        user.setEmail(email);
        user.setFullName(fullName);
        user.setPasswordHash(encoder.encode(password));
        user.setRoles(roles);
        user.setCreatedAt(Instant.now());
        repository.save(user);
    }

    private void seedCatalog(IngredientRepository ingredientRepository, ProductRepository productRepository, RecipeRepository recipeRepository) {
        Ingredient flour = createIngredientIfMissing(ingredientRepository, "Flour", "g", new BigDecimal("5000"), new BigDecimal("1000"));
        Ingredient sugar = createIngredientIfMissing(ingredientRepository, "Sugar", "g", new BigDecimal("2000"), new BigDecimal("500"));
        Ingredient butter = createIngredientIfMissing(ingredientRepository, "Butter", "g", new BigDecimal("1500"), new BigDecimal("300"));

        Product croissant = createProductIfMissing(productRepository, "Butter Croissant", "CROISSANT-001", "Pastry", new BigDecimal("3.50"), new BigDecimal("1.30"), new BigDecimal("40"));
        createRecipeIfMissing(recipeRepository, croissant.getId(), new BigDecimal("10"), List.of(
                item(flour.getId(), new BigDecimal("600")),
                item(sugar.getId(), new BigDecimal("120")),
                item(butter.getId(), new BigDecimal("300"))
        ));
    }

    private Ingredient createIngredientIfMissing(IngredientRepository repository, String name, String unit, BigDecimal stock, BigDecimal reorder) {
        return repository.findByNameIgnoreCase(name).orElseGet(() -> {
            Ingredient ingredient = new Ingredient();
            ingredient.setName(name);
            ingredient.setUnit(unit);
            ingredient.setCurrentStock(stock);
            ingredient.setReorderLevel(reorder);
            ingredient.setCostTrackingMethod("AVG_BIN");
            ingredient.setCreatedAt(Instant.now());
            ingredient.setUpdatedAt(Instant.now());
            return repository.save(ingredient);
        });
    }

    private Product createProductIfMissing(ProductRepository repository, String name, String sku, String category, BigDecimal price, BigDecimal cost, BigDecimal stock) {
        return repository.findBySkuIgnoreCase(sku).orElseGet(() -> {
            Product product = new Product();
            product.setName(name);
            product.setSku(sku);
            product.setCategory(category);
            product.setPrice(price);
            product.setCost(cost);
            product.setCurrentStock(stock);
            product.setActive(true);
            product.setCreatedAt(Instant.now());
            product.setUpdatedAt(Instant.now());
            return repository.save(product);
        });
    }

    private void createRecipeIfMissing(RecipeRepository repository, String productId, BigDecimal yieldQty, List<RecipeItem> items) {
        if (repository.findByProductId(productId).isPresent()) {
            return;
        }
        Recipe recipe = new Recipe();
        recipe.setProductId(productId);
        recipe.setYieldQty(yieldQty);
        recipe.setItems(items);
        recipe.setCreatedAt(Instant.now());
        recipe.setUpdatedAt(Instant.now());
        repository.save(recipe);
    }

    private RecipeItem item(String ingredientId, BigDecimal qtyPerBatch) {
        RecipeItem item = new RecipeItem();
        item.setIngredientId(ingredientId);
        item.setQtyPerBatch(qtyPerBatch);
        return item;
    }
}
