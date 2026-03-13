package com.embe.backend.order;

import com.embe.backend.product.ProductLotAllocation;
import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.mapping.FieldType;

import java.math.BigDecimal;
import java.util.List;

public class OrderItem {
    private String productId;
    private String name;
    @Field(targetType = FieldType.DECIMAL128)
    private BigDecimal price;
    @Field(targetType = FieldType.DECIMAL128)
    private BigDecimal qty;
    @Field(targetType = FieldType.DECIMAL128)
    private BigDecimal cost;
    private List<ProductLotAllocation> lotAllocations;

    public String getProductId() {
        return productId;
    }

    public void setProductId(String productId) {
        this.productId = productId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public BigDecimal getQty() {
        return qty;
    }

    public void setQty(BigDecimal qty) {
        this.qty = qty;
    }

    public BigDecimal getCost() {
        return cost;
    }

    public void setCost(BigDecimal cost) {
        this.cost = cost;
    }

    public List<ProductLotAllocation> getLotAllocations() {
        return lotAllocations;
    }

    public void setLotAllocations(List<ProductLotAllocation> lotAllocations) {
        this.lotAllocations = lotAllocations;
    }
}
