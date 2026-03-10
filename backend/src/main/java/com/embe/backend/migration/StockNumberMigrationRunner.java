package com.embe.backend.migration;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Updates;
import org.bson.BsonType;
import org.bson.Document;
import org.bson.types.Decimal128;
import org.bson.types.ObjectId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Component
@Order(1)
public class StockNumberMigrationRunner implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(StockNumberMigrationRunner.class);

    private final MongoTemplate mongoTemplate;

    public StockNumberMigrationRunner(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @Override
    public void run(String... args) {
        int productsMigrated = migrateNumericField("products", "currentStock");
        int ingredientsMigrated = migrateNumericField("ingredients", "currentStock");

        if (productsMigrated > 0 || ingredientsMigrated > 0) {
            log.info("Migrated numeric stock fields: products={}, ingredients={}", productsMigrated, ingredientsMigrated);
        }
    }

    private int migrateNumericField(String collectionName, String fieldName) {
        MongoCollection<Document> collection = mongoTemplate.getCollection(collectionName);
        int migratedCount = 0;
        for (Document document : collection.find(Filters.type(fieldName, BsonType.STRING))) {
            ObjectId id = document.getObjectId("_id");
            String rawValue = document.getString(fieldName);
            BigDecimal parsed = parseBigDecimal(rawValue);
            if (parsed == null) {
                log.warn("Skip migrating {}.{} for document {} due to non-numeric value: {}", collectionName, fieldName, id, rawValue);
                continue;
            }
            collection.updateOne(Filters.eq("_id", id), Updates.set(fieldName, new Decimal128(parsed)));
            migratedCount++;
        }
        return migratedCount;
    }

    private BigDecimal parseBigDecimal(String raw) {
        if (raw == null) {
            return null;
        }
        String normalized = raw.trim();
        if (normalized.isBlank()) {
            return null;
        }
        try {
            return new BigDecimal(normalized);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
