package com.embe.backend.stock;

import com.embe.backend.ingredient.Ingredient;
import com.embe.backend.product.Product;
import com.mongodb.MongoCommandException;
import com.mongodb.MongoException;
import com.mongodb.client.result.UpdateResult;
import org.springframework.dao.DataAccessException;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

@Service
public class MongoInventoryMutationService implements InventoryMutationService {

    private static final int MAX_WRITE_CONFLICT_RETRIES = 5;
    private static final long BASE_RETRY_SLEEP_MS = 10L;

    private final MongoTemplate mongoTemplate;

    public MongoInventoryMutationService(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @Override
    public boolean deductIngredientIfEnough(String ingredientId, BigDecimal qty) {
        Query query = Query.query(Criteria.where("id").is(ingredientId).and("currentStock").gte(qty));
        Update update = new Update().inc("currentStock", qty.negate());
        UpdateResult result = updateFirstWithRetry(query, update, Ingredient.class);
        return result.getModifiedCount() == 1;
    }

    @Override
    public void addIngredient(String ingredientId, BigDecimal qty) {
        Query query = Query.query(Criteria.where("id").is(ingredientId));
        Update update = new Update().inc("currentStock", qty);
        updateFirstWithRetry(query, update, Ingredient.class);
    }

    @Override
    public boolean deductProductIfEnough(String productId, BigDecimal qty) {
        Query query = Query.query(Criteria.where("id").is(productId).and("currentStock").gte(qty));
        Update update = new Update().inc("currentStock", qty.negate());
        UpdateResult result = updateFirstWithRetry(query, update, Product.class);
        return result.getModifiedCount() == 1;
    }

    @Override
    public void addProduct(String productId, BigDecimal qty) {
        Query query = Query.query(Criteria.where("id").is(productId));
        Update update = new Update().inc("currentStock", qty);
        updateFirstWithRetry(query, update, Product.class);
    }

    private UpdateResult updateFirstWithRetry(Query query, Update update, Class<?> entityClass) {
        int attempt = 0;
        while (true) {
            try {
                return mongoTemplate.updateFirst(query, update, entityClass);
            } catch (DataAccessException ex) {
                if (!isRetryableWriteConflict(ex) || attempt >= MAX_WRITE_CONFLICT_RETRIES) {
                    throw ex;
                }
                pauseBeforeRetry(attempt);
                attempt++;
            }
        }
    }

    private boolean isRetryableWriteConflict(Throwable throwable) {
        Throwable current = throwable;
        while (current != null) {
            if (current instanceof MongoCommandException commandException && commandException.getErrorCode() == 112) {
                return true;
            }
            if (current instanceof MongoException mongoException) {
                if (mongoException.getCode() == 112) {
                    return true;
                }
                if (mongoException.hasErrorLabel("TransientTransactionError")) {
                    return true;
                }
            }
            String message = current.getMessage();
            if (message != null && message.toLowerCase().contains("write conflict")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private void pauseBeforeRetry(int attempt) {
        long sleepMs = BASE_RETRY_SLEEP_MS * (attempt + 1L);
        try {
            Thread.sleep(sleepMs);
        } catch (InterruptedException interruptedException) {
            Thread.currentThread().interrupt();
        }
    }
}
