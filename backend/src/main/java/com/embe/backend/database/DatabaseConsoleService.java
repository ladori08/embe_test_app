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

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class DatabaseConsoleService {

    private static final int DEFAULT_PAGE = 1;
    private static final int DEFAULT_PAGE_SIZE = 50;
    private static final int MAX_PAGE_SIZE = 500;
    private static final int MAX_EXPORT_ROWS = 20_000;

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

    public void deleteDocument(String accessToken, String collectionName, String documentId) {
        validateAccess(accessToken);
        String collection = normalizeCollection(collectionName);
        ensureCollectionExists(collection);

        Object resolvedId = resolveDocumentId(documentId);
        Query query = Query.query(Criteria.where("_id").is(resolvedId));
        DeleteResult deleteResult = mongoTemplate.remove(query, collection);
        if (deleteResult.getDeletedCount() == 0 && resolvedId instanceof ObjectId) {
            deleteResult = mongoTemplate.remove(Query.query(Criteria.where("_id").is(documentId)), collection);
        }
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

    private String safeCurrentUserEmail() {
        try {
            return authService.currentUserEmail();
        } catch (Exception ignored) {
            return "system";
        }
    }
}
