package com.embe.backend.bake;

import java.math.BigDecimal;

public class BakeDeduction {
    private String ingredientId;
    private BigDecimal qty;

    public String getIngredientId() {
        return ingredientId;
    }

    public void setIngredientId(String ingredientId) {
        this.ingredientId = ingredientId;
    }

    public BigDecimal getQty() {
        return qty;
    }

    public void setQty(BigDecimal qty) {
        this.qty = qty;
    }
}
