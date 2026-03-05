package com.embe.backend.bake;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.mapping.FieldType;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@Document("bake_records")
public class BakeRecord {

    @Id
    private String id;

    @Indexed(unique = true)
    private String idempotencyKey;

    private String recipeId;

    private String productId;

    private Integer recipeVersion;

    private Boolean customOverride;

    private List<BakeAppliedItem> appliedItems;

    @Field(targetType = FieldType.DECIMAL128)
    private BigDecimal factor;

    @Field(targetType = FieldType.DECIMAL128)
    private BigDecimal producedQty;

    private List<BakeDeduction> deductions;

    @Indexed
    private Instant createdAt;

    private String createdBy;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public void setIdempotencyKey(String idempotencyKey) {
        this.idempotencyKey = idempotencyKey;
    }

    public String getRecipeId() {
        return recipeId;
    }

    public void setRecipeId(String recipeId) {
        this.recipeId = recipeId;
    }

    public String getProductId() {
        return productId;
    }

    public void setProductId(String productId) {
        this.productId = productId;
    }

    public Integer getRecipeVersion() {
        return recipeVersion;
    }

    public void setRecipeVersion(Integer recipeVersion) {
        this.recipeVersion = recipeVersion;
    }

    public Boolean getCustomOverride() {
        return customOverride;
    }

    public void setCustomOverride(Boolean customOverride) {
        this.customOverride = customOverride;
    }

    public List<BakeAppliedItem> getAppliedItems() {
        return appliedItems;
    }

    public void setAppliedItems(List<BakeAppliedItem> appliedItems) {
        this.appliedItems = appliedItems;
    }

    public BigDecimal getFactor() {
        return factor;
    }

    public void setFactor(BigDecimal factor) {
        this.factor = factor;
    }

    public BigDecimal getProducedQty() {
        return producedQty;
    }

    public void setProducedQty(BigDecimal producedQty) {
        this.producedQty = producedQty;
    }

    public List<BakeDeduction> getDeductions() {
        return deductions;
    }

    public void setDeductions(List<BakeDeduction> deductions) {
        this.deductions = deductions;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(String createdBy) {
        this.createdBy = createdBy;
    }
}
