package com.embe.backend.audit;

import com.embe.backend.auth.AuthService;
import com.embe.backend.common.ApiException;
import com.embe.backend.user.Role;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class AuditLogService {

    private static final int DEFAULT_LIMIT = 200;
    private static final int MAX_LIMIT = 500;

    private final AuditLogRepository auditLogRepository;
    private final MongoTemplate mongoTemplate;
    private final AuthService authService;
    private final ObjectMapper objectMapper;

    public AuditLogService(
            AuditLogRepository auditLogRepository,
            MongoTemplate mongoTemplate,
            AuthService authService,
            ObjectMapper objectMapper
    ) {
        this.auditLogRepository = auditLogRepository;
        this.mongoTemplate = mongoTemplate;
        this.authService = authService;
        this.objectMapper = objectMapper;
    }

    public void record(
            AuditModule module,
            AuditAction action,
            String title,
            String entityId,
            Object before,
            Object after,
            Map<String, Object> metadata
    ) {
        AuditLog log = new AuditLog();
        log.setTitle(title);
        log.setModule(module);
        log.setAction(action);
        log.setEntityId(entityId);
        log.setActorId(safeActorId());
        log.setActorEmail(safeActorEmail());
        log.setBeforeData(toMap(before));
        log.setAfterData(toMap(after));
        log.setMetadata(metadata == null || metadata.isEmpty() ? null : metadata);
        log.setCreatedAt(Instant.now());
        auditLogRepository.save(log);
    }

    public List<AuditLogListItem> list(
            String module,
            String action,
            String q,
            Instant from,
            Instant to,
            Integer limit
    ) {
        boolean canViewUserModule = authService.hasRole(Role.SUPERADMIN);
        Query query = new Query();
        query.with(Sort.by(Sort.Direction.DESC, "createdAt"));

        int finalLimit = normalizeLimit(limit);
        query.limit(finalLimit);

        if (module != null && !module.isBlank()) {
            AuditModule moduleFilter = parseEnum(module, AuditModule.class, "module");
            if (moduleFilter == AuditModule.USER && !canViewUserModule) {
                return List.of();
            }
            query.addCriteria(Criteria.where("module").is(moduleFilter));
        } else if (!canViewUserModule) {
            query.addCriteria(Criteria.where("module").ne(AuditModule.USER));
        }
        if (action != null && !action.isBlank()) {
            query.addCriteria(Criteria.where("action").is(parseEnum(action, AuditAction.class, "action")));
        }
        if (from != null || to != null) {
            Criteria createdAt = Criteria.where("createdAt");
            if (from != null) {
                createdAt = createdAt.gte(from);
            }
            if (to != null) {
                createdAt = createdAt.lte(to);
            }
            query.addCriteria(createdAt);
        }
        if (q != null && !q.isBlank()) {
            String pattern = ".*" + java.util.regex.Pattern.quote(q.trim()) + ".*";
            query.addCriteria(new Criteria().orOperator(
                    Criteria.where("title").regex(pattern, "i"),
                    Criteria.where("entityId").regex(pattern, "i"),
                    Criteria.where("actorEmail").regex(pattern, "i")
            ));
        }

        return mongoTemplate.find(query, AuditLog.class).stream().map(this::toListItem).toList();
    }

    public AuditLogDetailResponse get(String id) {
        AuditLog log = auditLogRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Audit log not found"));

        if (log.getModule() == AuditModule.USER && !authService.hasRole(Role.SUPERADMIN)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "You do not have permission to view this history record");
        }

        return toDetail(log);
    }

    private AuditLogListItem toListItem(AuditLog log) {
        return new AuditLogListItem(
                log.getId(),
                log.getTitle(),
                log.getModule() == null ? "" : log.getModule().name(),
                log.getAction() == null ? "" : log.getAction().name(),
                log.getEntityId(),
                log.getActorEmail(),
                log.getCreatedAt()
        );
    }

    private AuditLogDetailResponse toDetail(AuditLog log) {
        return new AuditLogDetailResponse(
                log.getId(),
                log.getTitle(),
                log.getModule() == null ? "" : log.getModule().name(),
                log.getAction() == null ? "" : log.getAction().name(),
                log.getEntityId(),
                log.getActorId(),
                log.getActorEmail(),
                log.getBeforeData(),
                log.getAfterData(),
                log.getMetadata(),
                log.getCreatedAt()
        );
    }

    private int normalizeLimit(Integer limit) {
        if (limit == null || limit <= 0) {
            return DEFAULT_LIMIT;
        }
        return Math.min(limit, MAX_LIMIT);
    }

    private <T extends Enum<T>> T parseEnum(String rawValue, Class<T> type, String fieldName) {
        try {
            return Enum.valueOf(type, rawValue.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid " + fieldName + " value: " + rawValue);
        }
    }

    private Map<String, Object> toMap(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.convertValue(value, new TypeReference<>() {
            });
        } catch (IllegalArgumentException ex) {
            return Collections.singletonMap("value", String.valueOf(value));
        }
    }

    private String safeActorId() {
        try {
            return authService.currentUserId();
        } catch (Exception ignored) {
            return "system";
        }
    }

    private String safeActorEmail() {
        try {
            return authService.currentUserEmail();
        } catch (Exception ignored) {
            return "system";
        }
    }
}
