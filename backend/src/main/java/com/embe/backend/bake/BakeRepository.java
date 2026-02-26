package com.embe.backend.bake;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface BakeRepository extends MongoRepository<BakeRecord, String> {
    Optional<BakeRecord> findByIdempotencyKey(String idempotencyKey);
    long countByCreatedAtAfter(Instant createdAt);
    List<BakeRecord> findByOrderByCreatedAtDesc();
}
