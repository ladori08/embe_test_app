package com.embe.backend.product;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface ProductLotRepository extends MongoRepository<ProductLot, String> {
    List<ProductLot> findByProductIdOrderByProducedAtAscCreatedAtAsc(String productId);

    List<ProductLot> findByProductIdOrderByProducedAtDescCreatedAtDesc(String productId);

    Optional<ProductLot> findByProductIdAndLotCode(String productId, String lotCode);
}
