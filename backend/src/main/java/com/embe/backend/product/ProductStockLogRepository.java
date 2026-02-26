package com.embe.backend.product;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface ProductStockLogRepository extends MongoRepository<ProductStockLog, String> {
    List<ProductStockLog> findByOrderByCreatedAtDesc();
}
