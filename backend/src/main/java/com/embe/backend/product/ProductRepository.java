package com.embe.backend.product;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface ProductRepository extends MongoRepository<Product, String> {
    Optional<Product> findBySkuIgnoreCase(String sku);
    List<Product> findByActiveTrueOrderByCreatedAtDesc();
}
