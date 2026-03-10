package com.embe.backend.recipe;

import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.mapping.FieldType;

import java.math.BigDecimal;

public class RecipeItem {
    private String ingredientId;
    @Field(targetType = FieldType.DECIMAL128)
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
