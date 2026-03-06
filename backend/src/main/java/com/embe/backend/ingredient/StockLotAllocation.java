package com.embe.backend.ingredient;

import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.mapping.FieldType;

import java.math.BigDecimal;

public class StockLotAllocation {
    private String lotCode;

    @Field(targetType = FieldType.DECIMAL128)
    private BigDecimal qty;

    public StockLotAllocation() {
    }

    public StockLotAllocation(String lotCode, BigDecimal qty) {
        this.lotCode = lotCode;
        this.qty = qty;
    }

    public String getLotCode() {
        return lotCode;
    }

    public void setLotCode(String lotCode) {
        this.lotCode = lotCode;
    }

    public BigDecimal getQty() {
        return qty;
    }

    public void setQty(BigDecimal qty) {
        this.qty = qty;
    }
}
