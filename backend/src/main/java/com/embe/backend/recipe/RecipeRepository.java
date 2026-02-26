package com.embe.backend.recipe;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface RecipeRepository extends MongoRepository<Recipe, String> {
    boolean existsByItemsIngredientId(String ingredientId);
    Optional<Recipe> findByProductId(String productId);
}
