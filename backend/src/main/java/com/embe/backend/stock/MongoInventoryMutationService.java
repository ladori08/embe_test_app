package com.embe.backend.stock;

import com.embe.backend.ingredient.Ingredient;
import com.embe.backend.product.Product;
import com.mongodb.client.result.UpdateResult;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

@Service
public class MongoInventoryMutationService implements InventoryMutationService {

    private final MongoTemplate mongoTemplate;

    public MongoInventoryMutationService(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @Override
    public boolean deductIngredientIfEnough(String ingredientId, BigDecimal qty) {
        Query query = Query.query(Criteria.where("id").is(ingredientId).and("currentStock").gte(qty));
        Update update = new Update().inc("currentStock", qty.negate());
        UpdateResult result = mongoTemplate.updateFirst(query, update, Ingredient.class);
        return result.getModifiedCount() == 1;
    }

    @Override
    public void addIngredient(String ingredientId, BigDecimal qty) {
        Query query = Query.query(Criteria.where("id").is(ingredientId));
        Update update = new Update().inc("currentStock", qty);
        mongoTemplate.updateFirst(query, update, Ingredient.class);
    }

    @Override
    public boolean deductProductIfEnough(String productId, BigDecimal qty) {
        Query query = Query.query(Criteria.where("id").is(productId).and("currentStock").gte(qty));
        Update update = new Update().inc("currentStock", qty.negate());
        UpdateResult result = mongoTemplate.updateFirst(query, update, Product.class);
        return result.getModifiedCount() == 1;
    }

    @Override
    public void addProduct(String productId, BigDecimal qty) {
        Query query = Query.query(Criteria.where("id").is(productId));
        Update update = new Update().inc("currentStock", qty);
        mongoTemplate.updateFirst(query, update, Product.class);
    }
}
