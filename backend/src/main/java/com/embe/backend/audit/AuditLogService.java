package com.embe.backend.audit;

import com.embe.backend.auth.AuthService;
import com.embe.backend.common.ApiException;
import com.embe.backend.user.Role;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class AuditLogService {

    private static final int DEFAULT_LIMIT = 200;
    private static final int MAX_LIMIT = 500;
    private static final Pattern OBJECT_ID_PATTERN = Pattern.compile("\\b[a-f0-9]{24}\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern UUID_PATTERN = Pattern.compile(
            "\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b",
            Pattern.CASE_INSENSITIVE
    );
    private static final List<String> PRIMARY_LABEL_KEYS = List.of(
            "name",
            "productName",
            "ingredientName",
            "categoryName",
            "fullName",
            "email",
            "recipientName",
            "title"
    );
    private static final List<String> FALLBACK_LABEL_KEYS = List.of(
            "ingredientCode",
            "sku",
            "lotCode",
            "category"
    );
    private static final List<String> REFERENCE_COLLECTIONS = List.of(
            "ingredients",
            "products",
            "recipes",
            "product_categories",
            "users",
            "orders",
            "bake_records",
            "ingredient_stock_transactions",
            "product_lots"
    );
    private static final List<String> DOCUMENT_LABEL_KEYS = List.of(
            "name",
            "title",
            "fullName",
            "email",
            "recipientName",
            "productName",
            "ingredientName",
            "sku",
            "ingredientCode",
            "lotCode",
            "category"
    );

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

    public List<AuditLogDetailResponse> listByModuleAndEntityId(AuditModule module, String entityId) {
        if (module == AuditModule.USER && !authService.hasRole(Role.SUPERADMIN)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "You do not have permission to view this history record");
        }
        if (entityId == null || entityId.isBlank()) {
            return List.of();
        }
        return auditLogRepository.findByModuleAndEntityIdOrderByCreatedAtAsc(module, entityId.trim())
                .stream()
                .map(this::toDetail)
                .toList();
    }

    private AuditLogListItem toListItem(AuditLog log) {
        return new AuditLogListItem(
                log.getId(),
                toDisplayTitle(log),
                log.getModule() == null ? "" : log.getModule().name(),
                log.getAction() == null ? "" : log.getAction().name(),
                log.getEntityId(),
                log.getActorEmail(),
                log.getCreatedAt()
        );
    }

    private AuditLogDetailResponse toDetail(AuditLog log) {
        Map<String, Object> detailMetadata = buildMetadataWithResolvedReferences(log.getMetadata(), log.getBeforeData(), log.getAfterData());
        return new AuditLogDetailResponse(
                log.getId(),
                toDisplayTitle(log),
                log.getModule() == null ? "" : log.getModule().name(),
                log.getAction() == null ? "" : log.getAction().name(),
                log.getEntityId(),
                log.getActorId(),
                log.getActorEmail(),
                log.getBeforeData(),
                log.getAfterData(),
                detailMetadata,
                log.getCreatedAt()
        );
    }

    private Map<String, Object> buildMetadataWithResolvedReferences(
            Map<String, Object> metadata,
            Map<String, Object> beforeData,
            Map<String, Object> afterData
    ) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (metadata != null && !metadata.isEmpty()) {
            result.putAll(metadata);
        }

        Map<String, String> resolvedReferences = new LinkedHashMap<>();
        Object existingResolved = result.get("resolvedReferences");
        if (existingResolved instanceof Map<?, ?> existingMap) {
            for (Map.Entry<?, ?> entry : existingMap.entrySet()) {
                String id = entry.getKey() == null ? "" : String.valueOf(entry.getKey()).trim();
                String label = entry.getValue() == null ? "" : String.valueOf(entry.getValue()).trim();
                if (!id.isBlank() && !label.isBlank()) {
                    resolvedReferences.put(id, label);
                }
            }
        }

        Set<String> candidateIds = new LinkedHashSet<>();
        collectCandidateIds(beforeData, candidateIds);
        collectCandidateIds(afterData, candidateIds);
        collectCandidateIds(metadata, candidateIds);

        List<String> collectionHints = new ArrayList<>();
        if (metadata != null) {
            String sourceCollection = metadata.get("sourceCollection") == null ? "" : String.valueOf(metadata.get("sourceCollection")).trim();
            String targetCollection = metadata.get("targetCollection") == null ? "" : String.valueOf(metadata.get("targetCollection")).trim();
            if (!sourceCollection.isBlank()) {
                collectionHints.add(sourceCollection);
            }
            if (!targetCollection.isBlank() && !targetCollection.equalsIgnoreCase(sourceCollection)) {
                collectionHints.add(targetCollection);
            }
        }

        for (String id : candidateIds) {
            if (resolvedReferences.containsKey(id)) {
                continue;
            }
            String label = resolveReferenceLabel(id, collectionHints);
            if (label != null && !label.isBlank()) {
                resolvedReferences.put(id, label);
            }
        }

        if (!resolvedReferences.isEmpty()) {
            result.put("resolvedReferences", resolvedReferences);
        }

        return result.isEmpty() ? null : result;
    }

    @SuppressWarnings("unchecked")
    private void collectCandidateIds(Object value, Set<String> collector) {
        if (value == null) {
            return;
        }
        if (value instanceof Map<?, ?> mapValue) {
            for (Map.Entry<?, ?> entry : mapValue.entrySet()) {
                collectCandidateIds(entry.getValue(), collector);
            }
            return;
        }
        if (value instanceof List<?> listValue) {
            for (Object item : listValue) {
                collectCandidateIds(item, collector);
            }
            return;
        }
        if (value instanceof String raw) {
            String trimmed = raw.trim();
            if (ObjectId.isValid(trimmed)) {
                collector.add(trimmed);
            }
        }
    }

    private String resolveReferenceLabel(String id, List<String> collectionHints) {
        if (id == null || id.isBlank()) {
            return null;
        }

        List<String> collectionsToTry = new ArrayList<>();
        for (String hint : collectionHints) {
            if (hint != null && !hint.isBlank() && !collectionsToTry.contains(hint)) {
                collectionsToTry.add(hint);
            }
        }
        for (String collection : REFERENCE_COLLECTIONS) {
            if (!collectionsToTry.contains(collection)) {
                collectionsToTry.add(collection);
            }
        }

        for (String collection : collectionsToTry) {
            Document document = findDocumentById(collection, id);
            if (document == null) {
                continue;
            }
            String label = extractDocumentLabel(document);
            if (label != null && !label.isBlank()) {
                return label;
            }
        }
        return null;
    }

    private Document findDocumentById(String collection, String id) {
        if (collection == null || collection.isBlank()) {
            return null;
        }

        Document document = null;
        if (ObjectId.isValid(id)) {
            document = mongoTemplate.findOne(Query.query(Criteria.where("_id").is(new ObjectId(id))), Document.class, collection);
        }
        if (document == null) {
            document = mongoTemplate.findOne(Query.query(Criteria.where("_id").is(id)), Document.class, collection);
        }
        return document;
    }

    private String extractDocumentLabel(Document document) {
        if (document == null) {
            return null;
        }

        for (String key : DOCUMENT_LABEL_KEYS) {
            String value = normalizeDisplayValue(document.get(key));
            if (value != null) {
                return value;
            }
        }

        Object items = document.get("items");
        if (items instanceof List<?> list && !list.isEmpty()) {
            for (Object item : list) {
                if (!(item instanceof Map<?, ?> itemMap)) {
                    continue;
                }
                String name = normalizeDisplayValue(itemMap.get("name"));
                if (name != null) {
                    return name;
                }
            }
        }

        return null;
    }

    private String toDisplayTitle(AuditLog log) {
        String title = log.getTitle() == null ? "" : log.getTitle().trim();
        if (title.isBlank()) {
            title = "Updated record";
        }

        String entityId = log.getEntityId() == null ? "" : log.getEntityId().trim();
        String label = resolvePrimaryLabel(log);
        if (label != null && !label.isBlank()) {
            if (!entityId.isBlank()) {
                title = title.replace("(" + entityId + ")", label);
                title = title.replace(entityId, label);
            }
            title = OBJECT_ID_PATTERN.matcher(title).replaceAll(label);
            title = UUID_PATTERN.matcher(title).replaceAll(label);
            return title;
        }

        title = OBJECT_ID_PATTERN.matcher(title).replaceAll("record");
        title = UUID_PATTERN.matcher(title).replaceAll("record");
        return title;
    }

    private String resolvePrimaryLabel(AuditLog log) {
        String fromAfter = resolvePrimaryLabel(log.getAfterData());
        if (fromAfter != null) {
            return fromAfter;
        }
        return resolvePrimaryLabel(log.getBeforeData());
    }

    @SuppressWarnings("unchecked")
    private String resolvePrimaryLabel(Map<String, Object> data) {
        if (data == null || data.isEmpty()) {
            return null;
        }

        for (String key : PRIMARY_LABEL_KEYS) {
            String normalized = normalizeDisplayValue(data.get(key));
            if (normalized != null) {
                return normalized;
            }
        }
        for (String key : FALLBACK_LABEL_KEYS) {
            String normalized = normalizeDisplayValue(data.get(key));
            if (normalized != null) {
                return normalized;
            }
        }

        Object items = data.get("items");
        if (items instanceof List<?> list && !list.isEmpty()) {
            int picked = 0;
            String first = null;
            String second = null;
            for (Object item : list) {
                if (!(item instanceof Map<?, ?> itemMap)) {
                    continue;
                }
                String candidate = normalizeDisplayValue(itemMap.get("name"));
                if (candidate == null) {
                    candidate = normalizeDisplayValue(itemMap.get("ingredientName"));
                }
                if (candidate == null) {
                    candidate = normalizeDisplayValue(itemMap.get("productName"));
                }
                if (candidate == null) {
                    continue;
                }
                if (first == null) {
                    first = candidate;
                    picked++;
                    continue;
                }
                if (second == null && !candidate.equalsIgnoreCase(first)) {
                    second = candidate;
                    picked++;
                }
                if (picked >= 2) {
                    break;
                }
            }
            if (first != null && second != null) {
                return first + ", " + second;
            }
            if (first != null) {
                return first;
            }
        }

        return null;
    }

    private String normalizeDisplayValue(Object value) {
        if (value == null) {
            return null;
        }
        String normalized = String.valueOf(value).trim();
        if (normalized.isBlank()) {
            return null;
        }
        if (OBJECT_ID_PATTERN.matcher(normalized).matches() || UUID_PATTERN.matcher(normalized).matches()) {
            return null;
        }
        return normalized;
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
