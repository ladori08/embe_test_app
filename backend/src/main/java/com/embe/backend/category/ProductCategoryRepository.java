package com.embe.backend.category;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface ProductCategoryRepository extends MongoRepository<ProductCategory, String> {
    Optional<ProductCategory> findByNameKey(String nameKey);
    List<ProductCategory> findBySkuStartingWith(String prefix);
    List<ProductCategory> findAllByOrderByNameAsc();
}
