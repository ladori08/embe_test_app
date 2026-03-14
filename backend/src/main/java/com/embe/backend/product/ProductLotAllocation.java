package com.embe.backend.product;

import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.mapping.FieldType;

import java.math.BigDecimal;
import java.time.Instant;

public class ProductLotAllocation {
    private String lotCode;

    @Field(targetType = FieldType.DECIMAL128)
    private BigDecimal qty;

    @Field(targetType = FieldType.DECIMAL128)
    private BigDecimal unitCost;

    @Field(targetType = FieldType.DECIMAL128)
    private BigDecimal subtotalCost;

    private Instant producedAt;

    private String reference;

    public ProductLotAllocation() {
    }

    public ProductLotAllocation(String lotCode, BigDecimal qty, BigDecimal unitCost, BigDecimal subtotalCost, Instant producedAt, String reference) {
        this.lotCode = lotCode;
        this.qty = qty;
        this.unitCost = unitCost;
        this.subtotalCost = subtotalCost;
        this.producedAt = producedAt;
        this.reference = reference;
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

    public BigDecimal getUnitCost() {
        return unitCost;
    }

    public void setUnitCost(BigDecimal unitCost) {
        this.unitCost = unitCost;
    }

    public BigDecimal getSubtotalCost() {
        return subtotalCost;
    }

    public void setSubtotalCost(BigDecimal subtotalCost) {
        this.subtotalCost = subtotalCost;
    }

    public Instant getProducedAt() {
        return producedAt;
    }

    public void setProducedAt(Instant producedAt) {
        this.producedAt = producedAt;
    }

    public String getReference() {
        return reference;
    }

    public void setReference(String reference) {
        this.reference = reference;
    }
}
