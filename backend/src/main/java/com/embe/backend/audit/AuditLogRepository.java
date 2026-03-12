package com.embe.backend.audit;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface AuditLogRepository extends MongoRepository<AuditLog, String> {
    List<AuditLog> findByModuleAndEntityIdOrderByCreatedAtAsc(AuditModule module, String entityId);
}
