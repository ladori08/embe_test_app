package com.embe.backend.database;

import com.embe.backend.common.ApiException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.bson.Document;
import org.bson.json.JsonMode;
import org.bson.json.JsonWriterSettings;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;

@Service
public class DatabaseBackupService {

    private static final DateTimeFormatter FILE_TIME_FORMAT =
            DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneId.systemDefault());

    private final MongoTemplate mongoTemplate;
    private final ObjectMapper objectMapper;
    private final String backupDir;
    private final JsonWriterSettings jsonWriterSettings;

    public DatabaseBackupService(
            MongoTemplate mongoTemplate,
            ObjectMapper objectMapper,
            @Value("${embe.database-console.backup-dir:backups/database-console}") String backupDir
    ) {
        this.mongoTemplate = mongoTemplate;
        this.objectMapper = objectMapper;
        this.backupDir = backupDir;
        this.jsonWriterSettings = JsonWriterSettings.builder().outputMode(JsonMode.RELAXED).build();
    }

    public DatabaseBackupResponse createBackup(String trigger, String actorEmail) {
        Instant now = Instant.now();
        String normalizedTrigger = normalizeTrigger(trigger);
        Path directory = Paths.get(backupDir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(directory);
            String fileName = "database-backup-" + normalizedTrigger.toLowerCase(Locale.ROOT) + "-" + FILE_TIME_FORMAT.format(now) + ".json";
            Path filePath = directory.resolve(fileName);

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("database", mongoTemplate.getDb().getName());
            payload.put("createdAt", now.toString());
            payload.put("trigger", normalizedTrigger);
            payload.put("actorEmail", actorEmail == null || actorEmail.isBlank() ? "system" : actorEmail);
            payload.put("collections", buildCollectionDump());

            objectMapper.writerWithDefaultPrettyPrinter().writeValue(filePath.toFile(), payload);

            return new DatabaseBackupResponse(fileName, filePath.toString(), normalizedTrigger, now);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to create database backup");
        }
    }

    public List<DatabaseBackupFileSummaryResponse> listBackups() {
        Path directory = backupDirectory();
        if (!Files.exists(directory)) {
            return List.of();
        }
        try (Stream<Path> paths = Files.list(directory)) {
            return paths
                    .filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".json"))
                    .map(this::toBackupFileSummary)
                    .sorted(Comparator.comparing(DatabaseBackupFileSummaryResponse::createdAt).reversed())
                    .toList();
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to list backup files");
        }
    }

    public DatabaseBackupDetailResponse getBackupDetail(String fileName) {
        Path filePath = resolveBackupFilePath(fileName);
        try {
            Map<String, Object> payload = readBackupPayload(filePath);
            Instant createdAt = parseInstant(payload.get("createdAt"), toLastModifiedInstant(filePath));
            String trigger = readString(payload.get("trigger"));
            String actorEmail = readString(payload.get("actorEmail"));
            String database = readString(payload.get("database"));
            List<DatabaseBackupCollectionSummaryResponse> collections = readCollectionSummaries(payload.get("collections"));
            long totalDocuments = collections.stream().mapToLong(DatabaseBackupCollectionSummaryResponse::count).sum();

            return new DatabaseBackupDetailResponse(
                    filePath.getFileName().toString(),
                    filePath.toString(),
                    createdAt,
                    trigger.isBlank() ? "UNKNOWN" : trigger,
                    actorEmail.isBlank() ? "system" : actorEmail,
                    database.isBlank() ? mongoTemplate.getDb().getName() : database,
                    totalDocuments,
                    collections
            );
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Failed to read backup file");
        }
    }

    @Transactional
    public DatabaseRestoreBackupResponse restoreBackup(String fileName, String actorEmail) {
        Path filePath = resolveBackupFilePath(fileName);
        Map<String, Object> payload;
        List<RestoreCollectionData> collections;
        try {
            payload = readBackupPayload(filePath);
            collections = readRestoreCollections(payload.get("collections"));
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Failed to parse backup file");
        }

        DatabaseBackupResponse preRestoreBackup = createBackup("MANUAL", actorEmail);

        List<String> existingCollections = new ArrayList<>(mongoTemplate.getCollectionNames());
        for (String collectionName : existingCollections) {
            mongoTemplate.getCollection(collectionName).deleteMany(new Document());
        }

        long documentsRestored = 0;
        for (RestoreCollectionData collectionData : collections) {
            if (collectionData.documents().isEmpty()) {
                continue;
            }
            mongoTemplate.getCollection(collectionData.name()).insertMany(collectionData.documents());
            documentsRestored += collectionData.documents().size();
        }

        return new DatabaseRestoreBackupResponse(
                filePath.getFileName().toString(),
                Instant.now(),
                collections.size(),
                documentsRestored,
                preRestoreBackup.fileName()
        );
    }

    private List<Map<String, Object>> buildCollectionDump() {
        List<String> collections = new ArrayList<>(mongoTemplate.getCollectionNames());
        collections.sort(String::compareToIgnoreCase);

        List<Map<String, Object>> dump = new ArrayList<>();
        for (String collection : collections) {
            List<String> documents = mongoTemplate.findAll(Document.class, collection).stream()
                    .map(document -> document.toJson(jsonWriterSettings))
                    .toList();

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("name", collection);
            item.put("count", documents.size());
            item.put("documents", documents);
            dump.add(item);
        }
        return dump;
    }

    private DatabaseBackupFileSummaryResponse toBackupFileSummary(Path path) {
        Instant createdAt = toLastModifiedInstant(path);
        long sizeBytes;
        try {
            sizeBytes = Files.size(path);
        } catch (IOException ignored) {
            sizeBytes = 0L;
        }
        return new DatabaseBackupFileSummaryResponse(
                path.getFileName().toString(),
                path.toAbsolutePath().normalize().toString(),
                createdAt,
                sizeBytes
        );
    }

    private Path backupDirectory() {
        return Paths.get(backupDir).toAbsolutePath().normalize();
    }

    private Path resolveBackupFilePath(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Backup file name is required");
        }
        String normalizedName = fileName.trim();
        if (!normalizedName.toLowerCase(Locale.ROOT).endsWith(".json")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Backup file must be a .json file");
        }
        Path directory = backupDirectory();
        Path filePath = directory.resolve(normalizedName).normalize();
        if (!filePath.startsWith(directory)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid backup file path");
        }
        if (!Files.exists(filePath) || !Files.isRegularFile(filePath)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Backup file not found");
        }
        return filePath;
    }

    private Map<String, Object> readBackupPayload(Path filePath) throws IOException {
        try (var inputStream = Files.newInputStream(filePath, StandardOpenOption.READ)) {
            return objectMapper.readValue(inputStream, new TypeReference<>() {
            });
        }
    }

    @SuppressWarnings("unchecked")
    private List<DatabaseBackupCollectionSummaryResponse> readCollectionSummaries(Object rawCollections) {
        if (!(rawCollections instanceof List<?> collectionList)) {
            return List.of();
        }
        List<DatabaseBackupCollectionSummaryResponse> summaries = new ArrayList<>();
        for (Object item : collectionList) {
            if (!(item instanceof Map<?, ?> rawMap)) {
                continue;
            }
            Map<String, Object> map = (Map<String, Object>) rawMap;
            String name = readString(map.get("name"));
            if (name.isBlank()) {
                continue;
            }
            long count = parseLong(map.get("count"));
            if (count <= 0 && map.get("documents") instanceof List<?> docs) {
                count = docs.size();
            }
            summaries.add(new DatabaseBackupCollectionSummaryResponse(name, count));
        }
        summaries.sort(Comparator.comparing(DatabaseBackupCollectionSummaryResponse::name));
        return summaries;
    }

    @SuppressWarnings("unchecked")
    private List<RestoreCollectionData> readRestoreCollections(Object rawCollections) {
        if (!(rawCollections instanceof List<?> collectionList)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Backup payload is missing collections");
        }
        List<RestoreCollectionData> result = new ArrayList<>();
        for (Object item : collectionList) {
            if (!(item instanceof Map<?, ?> rawMap)) {
                continue;
            }
            Map<String, Object> map = (Map<String, Object>) rawMap;
            String name = readString(map.get("name"));
            if (name.isBlank()) {
                continue;
            }

            List<Document> documents = new ArrayList<>();
            Object rawDocuments = map.get("documents");
            if (rawDocuments instanceof List<?> documentList) {
                for (Object rawDocument : documentList) {
                    if (rawDocument == null) {
                        continue;
                    }
                    if (rawDocument instanceof String jsonText) {
                        documents.add(Document.parse(jsonText));
                    } else if (rawDocument instanceof Map<?, ?> objectMap) {
                        documents.add(new Document((Map<String, Object>) objectMap));
                    } else {
                        throw new ApiException(HttpStatus.BAD_REQUEST, "Backup file has unsupported document format");
                    }
                }
            }
            result.add(new RestoreCollectionData(name, documents));
        }
        return result;
    }

    private Instant toLastModifiedInstant(Path path) {
        try {
            FileTime fileTime = Files.getLastModifiedTime(path);
            return fileTime.toInstant();
        } catch (IOException ex) {
            return Instant.now();
        }
    }

    private Instant parseInstant(Object rawValue, Instant fallback) {
        String value = readString(rawValue);
        if (value.isBlank()) {
            return fallback;
        }
        try {
            return Instant.parse(value);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private String readString(Object rawValue) {
        return rawValue == null ? "" : String.valueOf(rawValue).trim();
    }

    private long parseLong(Object rawValue) {
        if (rawValue == null) {
            return 0L;
        }
        if (rawValue instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(rawValue).trim());
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private String normalizeTrigger(String trigger) {
        if (trigger == null || trigger.isBlank()) {
            return "MANUAL";
        }
        String value = trigger.trim().toUpperCase(Locale.ROOT);
        if (!"AUTO".equals(value) && !"MANUAL".equals(value)) {
            return "MANUAL";
        }
        return value;
    }

    private record RestoreCollectionData(String name, List<Document> documents) {
    }
}
