package com.embe.backend.recipe;

import java.math.BigDecimal;

public class RecipeItem {
    private String ingredientId;
    private BigDecimal qtyPerBatch;

    public String getIngredientId() {
        return ingredientId;
    }

    public void setIngredientId(String ingredientId) {
        this.ingredientId = ingredientId;
    }

    public BigDecimal getQtyPerBatch() {
        return qtyPerBatch;
    }

    public void setQtyPerBatch(BigDecimal qtyPerBatch) {
        this.qtyPerBatch = qtyPerBatch;
    }
}
