package com.embe.backend.database;

import com.embe.backend.auth.AuthService;
import com.embe.backend.common.ApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mongodb.client.result.DeleteResult;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.bson.Document;
import org.bson.types.Decimal128;
import org.bson.types.ObjectId;
import org.springframework.http.HttpStatus;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Date;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class DatabaseConsoleService {

    private static final int DEFAULT_PAGE = 1;
    private static final int DEFAULT_PAGE_SIZE = 50;
    private static final int MAX_PAGE_SIZE = 500;
    private static final int MAX_EXPORT_ROWS = 20_000;
    private static final Pattern REFERENCE_KEY_PATTERN = Pattern.compile("(?i)(^_id$|^id$|.*id$|.*code$|.*sku$|.*email$)");

    private final MongoTemplate mongoTemplate;
    private final AuthService authService;
    private final ObjectMapper objectMapper;
    private final DatabaseConsoleSessionService sessionService;
    private final DatabaseBackupService backupService;

    public DatabaseConsoleService(
            MongoTemplate mongoTemplate,
            AuthService authService,
            ObjectMapper objectMapper,
            DatabaseConsoleSessionService sessionService,
            DatabaseBackupService backupService
    ) {
        this.mongoTemplate = mongoTemplate;
        this.authService = authService;
        this.objectMapper = objectMapper;
        this.sessionService = sessionService;
        this.backupService = backupService;
    }

    public DatabaseUnlockResponse unlock(String password) {
        ensureSuperAdmin();
        authService.verifyCurrentUserPassword(password);
        String userId = authService.currentUserId();
        DatabaseSessionToken sessionToken = sessionService.createSession(userId);
        DatabaseBackupResponse backup = backupService.createBackup("AUTO", safeCurrentUserEmail());
        return new DatabaseUnlockResponse(sessionToken.token(), sessionToken.expiresAt(), backup.fileName(), backup.filePath());
    }

    public List<DatabaseCollectionResponse> listCollections(String accessToken) {
        validateAccess(accessToken);
        List<String> collections = new ArrayList<>(mongoTemplate.getCollectionNames());
        collections.sort(String::compareToIgnoreCase);

        List<DatabaseCollectionResponse> result = new ArrayList<>();
        for (String name : collections) {
            long count = mongoTemplate.getCollection(name).countDocuments();
            result.add(new DatabaseCollectionResponse(name, count));
        }
        return result;
    }

    public DatabaseCollectionFieldsResponse listCollectionFields(String accessToken, String collectionName) {
        validateAccess(accessToken);
        String collection = normalizeCollection(collectionName);
        ensureCollectionExists(collection);

        Query query = new Query().limit(500);
        List<Document> documents = mongoTemplate.find(query, Document.class, collection);
        LinkedHashSet<String> fields = new LinkedHashSet<>();
        fields.add("_id");
        for (Document document : documents) {
            collectFieldNames("", document, fields);
        }

        List<String> ordered = new ArrayList<>();
        if (fields.remove("_id")) {
            ordered.add("_id");
        }
        ordered.addAll(fields.stream().sorted(String::compareTo).toList());
        return new DatabaseCollectionFieldsResponse(collection, ordered);
    }

    public DatabaseQueryResponse query(String accessToken, DatabaseQueryRequest request) {
        validateAccess(accessToken);
        String collection = normalizeCollection(request.collection());
        ensureCollectionExists(collection);

        int page = Math.max(DEFAULT_PAGE, request.page() == null ? DEFAULT_PAGE : request.page());
        int pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, request.pageSize() == null ? DEFAULT_PAGE_SIZE : request.pageSize()));

        Criteria filterCriteria = buildFilterCriteria(request.filters());

        Query countQuery = new Query();
        if (filterCriteria != null) {
            countQuery.addCriteria(filterCriteria);
        }
        long total = mongoTemplate.count(countQuery, collection);

        Query query = new Query();
        if (filterCriteria != null) {
            query.addCriteria(filterCriteria);
        }
        applySort(query, request.sortField(), request.sortDirection());
        query.skip((long) (page - 1) * pageSize);
        query.limit(pageSize);

        List<DatabaseQueryRow> rows = mongoTemplate.find(query, Document.class, collection).stream()
                .map(this::toRow)
                .toList();

        return new DatabaseQueryResponse(collection, total, page, pageSize, rows);
    }

    public DatabaseQueryRow updateDocument(
            String accessToken,
            String collectionName,
            String documentId,
            DatabaseDocumentUpdateRequest request
    ) {
        validateAccess(accessToken);
        String collection = normalizeCollection(collectionName);
        ensureCollectionExists(collection);

        Object resolvedId = resolveDocumentId(documentId);
        Document existing = findDocumentByResolvedId(collection, resolvedId, documentId);
        if (existing == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Document not found");
        }

        Document replacement = objectMapper.convertValue(request.document(), Document.class);
        if (replacement == null) {
            replacement = new Document();
        }
        replacement.put("_id", existing.get("_id"));
        mongoTemplate.save(replacement, collection);
        return toRow(replacement);
    }

    public DatabaseDependencyCheckResponse checkDependencies(String accessToken, String collectionName, String documentId) {
        validateAccess(accessToken);
        String collection = normalizeCollection(collectionName);
        ensureCollectionExists(collection);

        Object resolvedId = resolveDocumentId(documentId);
        Document targetDocument = findDocumentByResolvedId(collection, resolvedId, documentId);
        if (targetDocument == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Document not found");
        }

        return buildDependencyReport(collection, targetDocument);
    }

    @Transactional
    public DatabaseDependencyResolveResponse resolveDependencies(String accessToken, DatabaseDependencyResolveRequest request) {
        validateAccess(accessToken);
        String targetCollection = normalizeCollection(request.targetCollection());
        ensureCollectionExists(targetCollection);
        Object targetResolvedId = resolveDocumentId(request.targetDocumentId());
        Document targetDocument = findDocumentByResolvedId(targetCollection, targetResolvedId, request.targetDocumentId());
        if (targetDocument == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Target document not found");
        }

        int applied = 0;
        for (DatabaseDependencyResolveOperationRequest operation : request.operations()) {
            String collection = normalizeCollection(operation.collection());
            ensureCollectionExists(collection);
            Object resolvedId = resolveDocumentId(operation.documentId());
            Document sourceDocument = findDocumentByResolvedId(collection, resolvedId, operation.documentId());
            if (sourceDocument == null) {
                throw new ApiException(HttpStatus.NOT_FOUND, "Document not found for resolve operation: " + operation.documentId());
            }

            boolean changed = applyResolveOperation(sourceDocument, operation);
            if (changed) {
                mongoTemplate.save(sourceDocument, collection);
                applied++;
            }
        }

        return new DatabaseDependencyResolveResponse(
                targetCollection,
                stringifyScalar(targetDocument.get("_id")),
                request.operations().size(),
                applied
        );
    }

    public void deleteDocument(String accessToken, String collectionName, String documentId) {
        validateAccess(accessToken);
        String collection = normalizeCollection(collectionName);
        ensureCollectionExists(collection);

        Object resolvedId = resolveDocumentId(documentId);
        Document existing = findDocumentByResolvedId(collection, resolvedId, documentId);
        if (existing == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Document not found");
        }

        DatabaseDependencyCheckResponse dependencyReport = buildDependencyReport(collection, existing);
        if (dependencyReport.dependencyCount() > 0) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "Cannot delete because this document is referenced by other data",
                    Map.of(
                            "code", "DEPENDENCY_FOUND",
                            "dependencyCount", dependencyReport.dependencyCount(),
                            "dependencyInfo", dependencyReport
                    )
            );
        }

        Query query = Query.query(Criteria.where("_id").is(existing.get("_id")));
        DeleteResult deleteResult = mongoTemplate.remove(query, collection);
        if (deleteResult.getDeletedCount() == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Document not found");
        }
    }

    public DatabaseBackupResponse backup(String accessToken) {
        validateAccess(accessToken);
        return backupService.createBackup("MANUAL", safeCurrentUserEmail());
    }

    public List<DatabaseBackupFileSummaryResponse> listBackups(String accessToken) {
        validateAccess(accessToken);
        return backupService.listBackups();
    }

    public DatabaseBackupDetailResponse getBackupDetail(String accessToken, String fileName) {
        validateAccess(accessToken);
        return backupService.getBackupDetail(fileName);
    }

    public DatabaseRestoreBackupResponse restoreBackup(String accessToken, String fileName) {
        validateAccess(accessToken);
        return backupService.restoreBackup(fileName, safeCurrentUserEmail());
    }

    public DatabaseExportPayload export(String accessToken, String format, DatabaseExportRequest request) {
        validateAccess(accessToken);
        String collection = normalizeCollection(request.collection());
        ensureCollectionExists(collection);

        Criteria filterCriteria = buildFilterCriteria(request.filters());
        Query query = new Query();
        if (filterCriteria != null) {
            query.addCriteria(filterCriteria);
        }
        applySort(query, request.sortField(), request.sortDirection());
        query.limit(MAX_EXPORT_ROWS);

        List<Map<String, Object>> documents = mongoTemplate.find(query, Document.class, collection).stream()
                .map(this::toSerializableDocument)
                .toList();

        String normalizedFormat = format == null ? "csv" : format.trim().toLowerCase(Locale.ROOT);
        String timestamp = String.valueOf(System.currentTimeMillis());
        if ("xlsx".equals(normalizedFormat)) {
            byte[] bytes = buildXlsx(documents);
            return new DatabaseExportPayload(bytes, collection + "-export-" + timestamp + ".xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        }
        byte[] bytes = buildCsv(documents);
        return new DatabaseExportPayload(bytes, collection + "-export-" + timestamp + ".csv", "text/csv; charset=UTF-8");
    }

    private void validateAccess(String accessToken) {
        ensureSuperAdmin();
        sessionService.validate(accessToken, authService.currentUserId());
    }

    private void ensureSuperAdmin() {
        if (!authService.isSuperAdmin()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Superadmin permission is required");
        }
    }

    private String normalizeCollection(String collection) {
        if (collection == null || collection.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Collection is required");
        }
        return collection.trim();
    }

    private void ensureCollectionExists(String collection) {
        if (!mongoTemplate.collectionExists(collection)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Collection not found: " + collection);
        }
    }

    private void applySort(Query query, String sortField, String sortDirection) {
        String field = sortField == null || sortField.isBlank() ? "_id" : sortField.trim();
        Sort.Direction direction = "ASC".equalsIgnoreCase(sortDirection) ? Sort.Direction.ASC : Sort.Direction.DESC;
        query.with(Sort.by(direction, field));
    }

    private DatabaseDependencyCheckResponse buildDependencyReport(String targetCollection, Document targetDocument) {
        String targetId = stringifyScalar(targetDocument.get("_id"));
        String targetTitle = buildDocumentTitle(targetDocument, targetId);
        Set<String> candidateValues = buildCandidateValues(targetDocument);
        if (candidateValues.isEmpty() && targetId != null && !targetId.isBlank()) {
            candidateValues = Set.of(targetId);
        }

        List<DatabaseDependencyReferenceResponse> dependencies = findDependencies(
                targetCollection,
                targetId,
                candidateValues
        );
        return new DatabaseDependencyCheckResponse(
                targetCollection,
                targetId == null ? "" : targetId,
                targetTitle,
                dependencies.size(),
                dependencies
        );
    }

    private Set<String> buildCandidateValues(Document targetDocument) {
        Set<String> candidates = new HashSet<>();
        addCandidate(candidates, targetDocument.get("_id"));
        for (Map.Entry<String, Object> entry : targetDocument.entrySet()) {
            if (!REFERENCE_KEY_PATTERN.matcher(entry.getKey()).matches()) {
                continue;
            }
            addCandidate(candidates, entry.getValue());
        }
        candidates.removeIf(value -> value == null || value.isBlank());
        return candidates;
    }

    private void addCandidate(Set<String> candidates, Object value) {
        if (!isScalarValue(value)) {
            return;
        }
        String normalized = stringifyScalar(value);
        if (normalized != null && !normalized.isBlank()) {
            candidates.add(normalized);
        }
    }

    private List<DatabaseDependencyReferenceResponse> findDependencies(
            String targetCollection,
            String targetDocumentId,
            Set<String> candidateValues
    ) {
        if (candidateValues.isEmpty()) {
            return List.of();
        }

        List<String> collections = new ArrayList<>(mongoTemplate.getCollectionNames());
        collections.sort(String::compareToIgnoreCase);
        List<DatabaseDependencyReferenceResponse> result = new ArrayList<>();

        for (String collection : collections) {
            List<Document> documents = mongoTemplate.findAll(Document.class, collection);
            for (Document document : documents) {
                String documentId = stringifyScalar(document.get("_id"));
                if (Objects.equals(collection, targetCollection) && Objects.equals(documentId, targetDocumentId)) {
                    continue;
                }
                List<DependencyMatch> matches = new ArrayList<>();
                collectDependencyMatches("", document, candidateValues, matches);
                if (matches.isEmpty()) {
                    continue;
                }
                String title = buildDocumentTitle(document, documentId);
                for (DependencyMatch match : matches) {
                    result.add(new DatabaseDependencyReferenceResponse(
                            collection,
                            documentId == null ? "" : documentId,
                            title,
                            match.path(),
                            stringifyValue(match.value())
                    ));
                }
            }
        }

        result.sort(Comparator
                .comparing(DatabaseDependencyReferenceResponse::collection, String::compareToIgnoreCase)
                .thenComparing(DatabaseDependencyReferenceResponse::documentId)
                .thenComparing(DatabaseDependencyReferenceResponse::fieldPath));
        return result;
    }

    @SuppressWarnings("unchecked")
    private void collectDependencyMatches(
            String prefix,
            Object value,
            Set<String> candidateValues,
            List<DependencyMatch> matches
    ) {
        if (value == null) {
            return;
        }
        if (value instanceof Document document) {
            for (Map.Entry<String, Object> entry : document.entrySet()) {
                String fieldPath = prefix.isBlank() ? entry.getKey() : prefix + "." + entry.getKey();
                collectDependencyMatches(fieldPath, entry.getValue(), candidateValues, matches);
            }
            return;
        }
        if (value instanceof Map<?, ?> mapValue) {
            for (Map.Entry<?, ?> entry : mapValue.entrySet()) {
                String key = String.valueOf(entry.getKey());
                String fieldPath = prefix.isBlank() ? key : prefix + "." + key;
                collectDependencyMatches(fieldPath, entry.getValue(), candidateValues, matches);
            }
            return;
        }
        if (value instanceof List<?> listValue) {
            for (int i = 0; i < listValue.size(); i++) {
                Object item = listValue.get(i);
                String fieldPath = prefix + "[" + i + "]";
                collectDependencyMatches(fieldPath, item, candidateValues, matches);
            }
            return;
        }
        if (!isScalarValue(value)) {
            return;
        }
        String normalized = stringifyScalar(value);
        if (normalized == null || normalized.isBlank()) {
            return;
        }
        if (candidateValues.contains(normalized)) {
            matches.add(new DependencyMatch(prefix, value));
        }
    }

    @SuppressWarnings("unchecked")
    private boolean applyResolveOperation(Document sourceDocument, DatabaseDependencyResolveOperationRequest operation) {
        List<PathStep> steps = parseFieldPath(operation.fieldPath());
        ResolvedPath resolvedPath = resolvePath(sourceDocument, steps);
        if (resolvedPath == null) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "Field path not found for resolve operation",
                    Map.of(
                            "collection", operation.collection(),
                            "documentId", operation.documentId(),
                            "fieldPath", operation.fieldPath()
                    )
            );
        }

        if (operation.action() == DatabaseDependencyResolveAction.REMOVE) {
            if (resolvedPath.listContext() != null
                    && resolvedPath.terminal().kind() == PathStepKind.KEY
                    && REFERENCE_KEY_PATTERN.matcher(resolvedPath.terminal().key()).matches()) {
                List<Object> list = resolvedPath.listContext().list();
                int index = resolvedPath.listContext().index();
                if (index < 0 || index >= list.size()) {
                    return false;
                }
                list.remove(index);
                return true;
            }

            if (resolvedPath.parent() instanceof Map<?, ?> parentMap
                    && resolvedPath.terminal().kind() == PathStepKind.KEY) {
                String key = resolvedPath.terminal().key();
                if (!((Map<String, Object>) parentMap).containsKey(key)) {
                    return false;
                }
                ((Map<String, Object>) parentMap).remove(key);
                return true;
            }

            if (resolvedPath.parent() instanceof List<?> parentList
                    && resolvedPath.terminal().kind() == PathStepKind.INDEX) {
                int index = resolvedPath.terminal().index();
                if (index < 0 || index >= parentList.size()) {
                    return false;
                }
                ((List<Object>) parentList).remove(index);
                return true;
            }

            throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported remove operation at path: " + operation.fieldPath());
        }

        Object replacement = resolveReplacementValue(operation, resolvedPath.currentValue());
        if (Objects.equals(resolvedPath.currentValue(), replacement)) {
            return false;
        }

        if (resolvedPath.parent() instanceof Map<?, ?> parentMap
                && resolvedPath.terminal().kind() == PathStepKind.KEY) {
            ((Map<String, Object>) parentMap).put(resolvedPath.terminal().key(), replacement);
            return true;
        }
        if (resolvedPath.parent() instanceof List<?> parentList
                && resolvedPath.terminal().kind() == PathStepKind.INDEX) {
            int index = resolvedPath.terminal().index();
            if (index < 0 || index >= parentList.size()) {
                return false;
            }
            ((List<Object>) parentList).set(index, replacement);
            return true;
        }
        throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported replace operation at path: " + operation.fieldPath());
    }

    private Object resolveReplacementValue(DatabaseDependencyResolveOperationRequest operation, Object currentValue) {
        if (operation.action() != DatabaseDependencyResolveAction.REPLACE) {
            return null;
        }

        if (operation.replacementValue() != null && !operation.replacementValue().isBlank()) {
            return parseValue(operation.replacementValue());
        }

        if (operation.replacementDocumentId() == null || operation.replacementDocumentId().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Replacement document id is required for REPLACE action");
        }

        String replacementCollection = operation.replacementCollection();
        if (replacementCollection != null && !replacementCollection.isBlank()) {
            String normalizedCollection = normalizeCollection(replacementCollection);
            ensureCollectionExists(normalizedCollection);
            Object replacementResolvedId = resolveDocumentId(operation.replacementDocumentId());
            Document replacementDocument = findDocumentByResolvedId(
                    normalizedCollection,
                    replacementResolvedId,
                    operation.replacementDocumentId()
            );
            if (replacementDocument == null) {
                throw new ApiException(HttpStatus.NOT_FOUND, "Replacement document not found");
            }
        }

        if (currentValue instanceof ObjectId) {
            if (!ObjectId.isValid(operation.replacementDocumentId().trim())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Replacement id must be ObjectId for current field type");
            }
            return new ObjectId(operation.replacementDocumentId().trim());
        }

        return operation.replacementDocumentId().trim();
    }

    private List<PathStep> parseFieldPath(String fieldPath) {
        if (fieldPath == null || fieldPath.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Field path is required");
        }
        Matcher matcher = Pattern.compile("([^.\\[\\]]+)|\\[(\\d+)]").matcher(fieldPath.trim());
        List<PathStep> steps = new ArrayList<>();
        while (matcher.find()) {
            String key = matcher.group(1);
            String index = matcher.group(2);
            if (key != null) {
                steps.add(PathStep.key(key));
            } else if (index != null) {
                steps.add(PathStep.index(Integer.parseInt(index)));
            }
        }
        if (steps.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid field path: " + fieldPath);
        }
        return steps;
    }

    @SuppressWarnings("unchecked")
    private ResolvedPath resolvePath(Document sourceDocument, List<PathStep> steps) {
        Object current = sourceDocument;
        Object parent = null;
        ListContext listContext = null;

        for (int i = 0; i < steps.size(); i++) {
            PathStep step = steps.get(i);
            boolean terminal = i == steps.size() - 1;

            if (step.kind() == PathStepKind.KEY) {
                if (!(current instanceof Map<?, ?> mapValue)) {
                    return null;
                }
                if (terminal) {
                    return new ResolvedPath(mapValue, step, ((Map<String, Object>) mapValue).get(step.key()), listContext);
                }
                parent = mapValue;
                current = ((Map<String, Object>) mapValue).get(step.key());
                if (current == null) {
                    return null;
                }
                continue;
            }

            if (!(current instanceof List<?> listValue)) {
                return null;
            }
            int index = step.index();
            if (index < 0 || index >= listValue.size()) {
                return null;
            }
            if (terminal) {
                return new ResolvedPath(listValue, step, listValue.get(index), listContext);
            }
            parent = listValue;
            listContext = new ListContext((List<Object>) listValue, index);
            current = listValue.get(index);
            if (current == null) {
                return null;
            }
        }
        return parent == null ? null : new ResolvedPath(parent, steps.getLast(), current, listContext);
    }

    private boolean isScalarValue(Object value) {
        return value instanceof String
                || value instanceof Number
                || value instanceof Boolean
                || value instanceof ObjectId
                || value instanceof Instant
                || value instanceof Date
                || value instanceof Decimal128;
    }

    private String stringifyScalar(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof ObjectId objectId) {
            return objectId.toHexString();
        }
        if (value instanceof Instant instant) {
            return instant.toString();
        }
        if (value instanceof Date date) {
            return date.toInstant().toString();
        }
        if (value instanceof Decimal128 decimal128) {
            return decimal128.bigDecimalValue().stripTrailingZeros().toPlainString();
        }
        return String.valueOf(value).trim();
    }

    private String buildDocumentTitle(Document document, String fallbackId) {
        List<String> candidateKeys = List.of("name", "title", "email", "sku", "ingredientCode", "lotCode", "productId", "recipeId");
        for (String key : candidateKeys) {
            Object value = document.get(key);
            if (value == null) {
                continue;
            }
            String normalized = stringifyScalar(value);
            if (normalized != null && !normalized.isBlank()) {
                return key + ": " + normalized;
            }
        }
        if (fallbackId == null || fallbackId.isBlank()) {
            return "Document";
        }
        return "id: " + fallbackId;
    }

    @SuppressWarnings("unchecked")
    private void collectFieldNames(String prefix, Object value, LinkedHashSet<String> fields) {
        if (value == null) {
            return;
        }
        if (value instanceof Document document) {
            for (Map.Entry<String, Object> entry : document.entrySet()) {
                String field = prefix.isBlank() ? entry.getKey() : prefix + "." + entry.getKey();
                fields.add(field);
                collectFieldNames(field, entry.getValue(), fields);
            }
            return;
        }
        if (value instanceof Map<?, ?> mapValue) {
            for (Map.Entry<?, ?> entry : mapValue.entrySet()) {
                String key = String.valueOf(entry.getKey());
                String field = prefix.isBlank() ? key : prefix + "." + key;
                fields.add(field);
                collectFieldNames(field, entry.getValue(), fields);
            }
            return;
        }
        if (value instanceof List<?> listValue) {
            for (Object item : listValue) {
                collectFieldNames(prefix, item, fields);
            }
        }
    }

    private Document findDocumentByResolvedId(String collection, Object resolvedId, String fallbackStringId) {
        Query byResolved = Query.query(Criteria.where("_id").is(resolvedId));
        Document existing = mongoTemplate.findOne(byResolved, Document.class, collection);
        if (existing != null || !(resolvedId instanceof ObjectId)) {
            return existing;
        }
        return mongoTemplate.findOne(Query.query(Criteria.where("_id").is(fallbackStringId)), Document.class, collection);
    }

    private Object resolveDocumentId(String rawId) {
        if (rawId == null || rawId.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Document id is required");
        }
        String normalized = rawId.trim();
        if (ObjectId.isValid(normalized)) {
            return new ObjectId(normalized);
        }
        return normalized;
    }

    private Criteria buildFilterCriteria(List<DatabaseFilterCondition> filters) {
        if (filters == null || filters.isEmpty()) {
            return null;
        }
        List<Criteria> criteriaList = new ArrayList<>();
        for (DatabaseFilterCondition filter : filters) {
            if (filter == null) {
                continue;
            }
            String field = filter.field() == null ? "" : filter.field().trim();
            if (field.isBlank()) {
                continue;
            }
            DatabaseFilterOperator operator = filter.operator() == null ? DatabaseFilterOperator.EQ : filter.operator();
            String rawValue = filter.value();
            criteriaList.add(toCriteria(field, operator, rawValue));
        }
        if (criteriaList.isEmpty()) {
            return null;
        }
        if (criteriaList.size() == 1) {
            return criteriaList.getFirst();
        }
        return new Criteria().andOperator(criteriaList.toArray(new Criteria[0]));
    }

    private Criteria toCriteria(String field, DatabaseFilterOperator operator, String rawValue) {
        return switch (operator) {
            case EQ -> Criteria.where(field).is(parseValue(rawValue));
            case NE -> Criteria.where(field).ne(parseValue(rawValue));
            case CONTAINS -> Criteria.where(field).regex(buildRegex(rawValue, true, true), "i");
            case STARTS_WITH -> Criteria.where(field).regex(buildRegex(rawValue, false, true), "i");
            case ENDS_WITH -> Criteria.where(field).regex(buildRegex(rawValue, true, false), "i");
            case GT -> Criteria.where(field).gt(requireComparableValue(field, rawValue));
            case GTE -> Criteria.where(field).gte(requireComparableValue(field, rawValue));
            case LT -> Criteria.where(field).lt(requireComparableValue(field, rawValue));
            case LTE -> Criteria.where(field).lte(requireComparableValue(field, rawValue));
            case IN -> Criteria.where(field).in(parseInValues(rawValue));
            case EXISTS -> Criteria.where(field).exists(parseExists(rawValue));
        };
    }

    private String buildRegex(String rawValue, boolean prefixWildcard, boolean suffixWildcard) {
        String value = rawValue == null ? "" : rawValue.trim();
        StringBuilder pattern = new StringBuilder();
        if (prefixWildcard) {
            pattern.append(".*");
        }
        pattern.append(Pattern.quote(value));
        if (suffixWildcard) {
            pattern.append(".*");
        }
        return pattern.toString();
    }

    private Object requireComparableValue(String field, String rawValue) {
        Object value = parseValue(rawValue);
        if (value == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Filter value is required for operator on field " + field);
        }
        return value;
    }

    private List<Object> parseInValues(String rawValue) {
        if (rawValue == null || rawValue.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "IN operator requires a non-empty comma-separated value");
        }
        return Arrays.stream(rawValue.split(","))
                .map(String::trim)
                .filter(part -> !part.isBlank())
                .map(this::parseValue)
                .toList();
    }

    private boolean parseExists(String rawValue) {
        if (rawValue == null || rawValue.isBlank()) {
            return true;
        }
        return Boolean.parseBoolean(rawValue.trim());
    }

    private Object parseValue(String rawValue) {
        if (rawValue == null) {
            return null;
        }
        String value = rawValue.trim();
        if (value.isBlank()) {
            return "";
        }
        if ("null".equalsIgnoreCase(value)) {
            return null;
        }
        if ("true".equalsIgnoreCase(value) || "false".equalsIgnoreCase(value)) {
            return Boolean.parseBoolean(value);
        }
        if (ObjectId.isValid(value)) {
            return new ObjectId(value);
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException ignored) {
            // continue
        }
        try {
            return new BigDecimal(value);
        } catch (NumberFormatException ignored) {
            // continue
        }
        try {
            Instant instant = Instant.parse(value);
            return Date.from(instant);
        } catch (DateTimeParseException ignored) {
            // keep as string
        }
        return value;
    }

    private DatabaseQueryRow toRow(Document document) {
        Object rawId = document.get("_id");
        String id = rawId == null ? "" : String.valueOf(toSerializableValue(rawId));
        return new DatabaseQueryRow(id, toSerializableDocument(document));
    }

    private Map<String, Object> toSerializableDocument(Document source) {
        Map<String, Object> mapped = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : source.entrySet()) {
            mapped.put(entry.getKey(), toSerializableValue(entry.getValue()));
        }
        return mapped;
    }

    @SuppressWarnings("unchecked")
    private Object toSerializableValue(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof ObjectId objectId) {
            return objectId.toHexString();
        }
        if (value instanceof Instant instant) {
            return instant.toString();
        }
        if (value instanceof Date date) {
            return date.toInstant().toString();
        }
        if (value instanceof Decimal128 decimal128) {
            return decimal128.bigDecimalValue();
        }
        if (value instanceof Document document) {
            Map<String, Object> nested = new LinkedHashMap<>();
            for (Map.Entry<String, Object> entry : document.entrySet()) {
                nested.put(entry.getKey(), toSerializableValue(entry.getValue()));
            }
            return nested;
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> nested = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                nested.put(String.valueOf(entry.getKey()), toSerializableValue(entry.getValue()));
            }
            return nested;
        }
        if (value instanceof List<?> list) {
            List<Object> nested = new ArrayList<>();
            for (Object item : list) {
                nested.add(toSerializableValue(item));
            }
            return nested;
        }
        if (value instanceof Number || value instanceof Boolean || value instanceof String) {
            return value;
        }
        return String.valueOf(value);
    }

    private byte[] buildCsv(List<Map<String, Object>> documents) {
        List<Map<String, String>> flatRows = new ArrayList<>();
        LinkedHashSet<String> columns = new LinkedHashSet<>();
        for (Map<String, Object> document : documents) {
            Map<String, String> row = new LinkedHashMap<>();
            flattenDocument("", document, row);
            flatRows.add(row);
            columns.addAll(row.keySet());
        }
        List<String> orderedColumns = orderColumns(columns);

        StringBuilder csv = new StringBuilder();
        for (int i = 0; i < orderedColumns.size(); i++) {
            if (i > 0) {
                csv.append(',');
            }
            csv.append(escapeCsv(orderedColumns.get(i)));
        }
        csv.append('\n');

        for (Map<String, String> row : flatRows) {
            for (int i = 0; i < orderedColumns.size(); i++) {
                if (i > 0) {
                    csv.append(',');
                }
                String cell = row.getOrDefault(orderedColumns.get(i), "");
                csv.append(escapeCsv(cell));
            }
            csv.append('\n');
        }
        return csv.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    private byte[] buildXlsx(List<Map<String, Object>> documents) {
        List<Map<String, String>> flatRows = new ArrayList<>();
        LinkedHashSet<String> columns = new LinkedHashSet<>();
        for (Map<String, Object> document : documents) {
            Map<String, String> row = new LinkedHashMap<>();
            flattenDocument("", document, row);
            flatRows.add(row);
            columns.addAll(row.keySet());
        }
        List<String> orderedColumns = orderColumns(columns);

        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Export");
            Row header = sheet.createRow(0);
            for (int col = 0; col < orderedColumns.size(); col++) {
                header.createCell(col).setCellValue(orderedColumns.get(col));
            }

            for (int rowIndex = 0; rowIndex < flatRows.size(); rowIndex++) {
                Row row = sheet.createRow(rowIndex + 1);
                Map<String, String> values = flatRows.get(rowIndex);
                for (int col = 0; col < orderedColumns.size(); col++) {
                    String value = values.getOrDefault(orderedColumns.get(col), "");
                    row.createCell(col).setCellValue(value);
                }
            }

            for (int col = 0; col < orderedColumns.size(); col++) {
                sheet.autoSizeColumn(col);
            }

            workbook.write(outputStream);
            return outputStream.toByteArray();
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to generate XLSX export");
        }
    }

    @SuppressWarnings("unchecked")
    private void flattenDocument(String prefix, Map<String, Object> source, Map<String, String> target) {
        for (Map.Entry<String, Object> entry : source.entrySet()) {
            String key = prefix.isBlank() ? entry.getKey() : prefix + "." + entry.getKey();
            Object value = entry.getValue();
            if (value instanceof Map<?, ?> nestedMap) {
                flattenDocument(key, (Map<String, Object>) nestedMap, target);
            } else {
                target.put(key, stringifyValue(value));
            }
        }
    }

    private String stringifyValue(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof String stringValue) {
            return stringValue;
        }
        if (value instanceof Number || value instanceof Boolean) {
            return String.valueOf(value);
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            return String.valueOf(value);
        }
    }

    private List<String> orderColumns(LinkedHashSet<String> columns) {
        List<String> ordered = new ArrayList<>();
        if (columns.remove("_id")) {
            ordered.add("_id");
        }
        ordered.addAll(columns);
        return ordered;
    }

    private String escapeCsv(String value) {
        String cell = value == null ? "" : value;
        if (!cell.contains(",") && !cell.contains("\"") && !cell.contains("\n") && !cell.contains("\r")) {
            return cell;
        }
        return "\"" + cell.replace("\"", "\"\"") + "\"";
    }

    private record DependencyMatch(String path, Object value) {
    }

    private record ResolvedPath(Object parent, PathStep terminal, Object currentValue, ListContext listContext) {
    }

    private record ListContext(List<Object> list, int index) {
    }

    private enum PathStepKind {
        KEY,
        INDEX
    }

    private record PathStep(PathStepKind kind, String key, int index) {
        static PathStep key(String key) {
            return new PathStep(PathStepKind.KEY, key, -1);
        }

        static PathStep index(int index) {
            return new PathStep(PathStepKind.INDEX, null, index);
        }
    }

    private String safeCurrentUserEmail() {
        try {
            return authService.currentUserEmail();
        } catch (Exception ignored) {
            return "system";
        }
    }
}
