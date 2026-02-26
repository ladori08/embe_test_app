package com.embe.backend.stock;

import java.math.BigDecimal;

public interface InventoryMutationService {
    boolean deductIngredientIfEnough(String ingredientId, BigDecimal qty);

    void addIngredient(String ingredientId, BigDecimal qty);

    boolean deductProductIfEnough(String productId, BigDecimal qty);

    void addProduct(String productId, BigDecimal qty);
}
