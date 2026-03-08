package com.embe.backend.ingredient;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface IngredientRepository extends MongoRepository<Ingredient, String> {
    Optional<Ingredient> findByNameIgnoreCase(String name);

    Optional<Ingredient> findByIngredientCodeIgnoreCase(String ingredientCode);

    java.util.List<Ingredient> findByIngredientCodeStartingWith(String ingredientCodePrefix);
}
