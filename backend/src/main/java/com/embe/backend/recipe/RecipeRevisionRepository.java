package com.embe.backend.recipe;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface RecipeRevisionRepository extends MongoRepository<RecipeRevision, String> {
    List<RecipeRevision> findByRecipeIdOrderByVersionDesc(String recipeId);
    boolean existsByRecipeIdAndVersion(String recipeId, Integer version);
}
