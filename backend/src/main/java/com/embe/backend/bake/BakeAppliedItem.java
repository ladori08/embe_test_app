package com.embe.backend.bake;

import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.mapping.FieldType;

import java.math.BigDecimal;

public class BakeAppliedItem {

    private String ingredientId;

    private String ingredientName;

    private String unit;

    @Field(targetType = FieldType.DECIMAL128)
    private BigDecimal qtyPerBatch;

    public String getIngredientId() {
        return ingredientId;
    }

    public void setIngredientId(String ingredientId) {
        this.ingredientId = ingredientId;
    }

    public String getIngredientName() {
        return ingredientName;
    }

    public void setIngredientName(String ingredientName) {
        this.ingredientName = ingredientName;
    }

    public String getUnit() {
        return unit;
    }

    public void setUnit(String unit) {
        this.unit = unit;
    }

    public BigDecimal getQtyPerBatch() {
        return qtyPerBatch;
    }

    public void setQtyPerBatch(BigDecimal qtyPerBatch) {
        this.qtyPerBatch = qtyPerBatch;
    }
}
