package com.embe.backend.ingredient;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface StockTransactionRepository extends MongoRepository<StockTransaction, String> {
    List<StockTransaction> findByIngredientIdOrderByCreatedAtDesc(String ingredientId);
}
