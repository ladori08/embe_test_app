package com.embe.backend.bake;

import com.embe.backend.ingredient.StockLotAllocation;
import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.mapping.FieldType;

import java.math.BigDecimal;
import java.util.List;

public class BakeDeduction {
    private String ingredientId;
    private String ingredientName;
    private String unit;

    @Field(targetType = FieldType.DECIMAL128)
    private BigDecimal qty;
    private List<StockLotAllocation> lotAllocations;

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

    public BigDecimal getQty() {
        return qty;
    }

    public void setQty(BigDecimal qty) {
        this.qty = qty;
    }

    public List<StockLotAllocation> getLotAllocations() {
        return lotAllocations;
    }

    public void setLotAllocations(List<StockLotAllocation> lotAllocations) {
        this.lotAllocations = lotAllocations;
    }
}
