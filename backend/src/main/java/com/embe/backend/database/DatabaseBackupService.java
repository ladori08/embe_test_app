package com.embe.backend.database;

import com.embe.backend.common.ApiException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.bson.Document;
import org.bson.json.JsonMode;
import org.bson.json.JsonWriterSettings;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Service;

import java.awt.Desktop;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Service
public class DatabaseBackupService {

    private static final Logger LOG = LoggerFactory.getLogger(DatabaseBackupService.class);

    private static final DateTimeFormatter FILE_TIME_FORMAT =
            DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneId.systemDefault());
    private static final DateTimeFormatter LOCAL_FILE_TIME_PARSER =
            DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");
    private static final DateTimeFormatter DRIVE_FILE_TIME_FORMAT =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmssX").withZone(ZoneOffset.UTC);
    private static final Pattern LOCAL_BACKUP_PATTERN =
            Pattern.compile("^database-backup-([a-zA-Z0-9_\\-]+)-([0-9]{8}-[0-9]{6})\\.json$");
    private static final Pattern DRIVE_ARCHIVE_PATTERN =
            Pattern.compile("^embe-(auto|login|manual)-([0-9]{8}T[0-9]{6}Z)-.*\\.archive\\.gz$");

    private final MongoTemplate mongoTemplate;
    private final ObjectMapper objectMapper;
    private final String backupDir;
    private final String driveRemote;
    private final String mongoUri;
    private final Path driveTempDir;
    private final long driveCommandTimeoutSeconds;
    private final int driveAutoRetention;
    private final int driveLoginRetention;
    private final JsonWriterSettings jsonWriterSettings;

    public DatabaseBackupService(
            MongoTemplate mongoTemplate,
            ObjectMapper objectMapper,
            @Value("${embe.database-console.backup-dir:backups/database-console}") String backupDir,
            @Value("${embe.database-console.drive.remote:}") String driveRemote,
            @Value("${spring.data.mongodb.uri:mongodb://localhost:27017/embe?replicaSet=rs0}") String mongoUri,
            @Value("${embe.database-console.drive.temp-dir:/tmp/embe-database-drive}") String driveTempDir,
            @Value("${embe.database-console.drive.command-timeout-seconds:300}") long driveCommandTimeoutSeconds,
            @Value("${embe.database-console.drive.retention.auto:16}") int driveAutoRetention,
            @Value("${embe.database-console.drive.retention.login:10}") int driveLoginRetention
    ) {
        this.mongoTemplate = mongoTemplate;
        this.objectMapper = objectMapper;
        this.backupDir = backupDir;
        this.driveRemote = driveRemote == null ? "" : driveRemote.trim();
        this.mongoUri = mongoUri;
        this.driveTempDir = Paths.get(driveTempDir).toAbsolutePath().normalize();
        this.driveCommandTimeoutSeconds = Math.max(30L, driveCommandTimeoutSeconds);
        this.driveAutoRetention = Math.max(0, driveAutoRetention);
        this.driveLoginRetention = Math.max(0, driveLoginRetention);
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
            uploadBackupToDriveIfConfigured(filePath, normalizedTrigger);

            return new DatabaseBackupResponse(fileName, filePath.toString(), normalizedTrigger, now);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to create database backup");
        }
    }

    public List<DatabaseBackupFileSummaryResponse> listBackups() {
        return listBackups(DatabaseBackupSource.LOCAL);
    }

    public List<DatabaseBackupFileSummaryResponse> listBackups(DatabaseBackupSource source) {
        if (source == DatabaseBackupSource.DRIVE) {
            return listDriveBackups();
        }

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

    public DatabaseBackupDirectoryResponse getBackupDirectory() {
        Path directory = backupDirectory();
        try {
            Files.createDirectories(directory);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to access backup directory");
        }
        return new DatabaseBackupDirectoryResponse(directory.toString());
    }

    public DatabaseOpenDirectoryResponse openBackupDirectory() {
        Path directory = backupDirectory();
        try {
            Files.createDirectories(directory);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to access backup directory");
        }

        if (isAndroidRuntime()) {
            throw new ApiException(
                    HttpStatus.NOT_IMPLEMENTED,
                    "Open backup folder is not supported on Android runtime",
                    Map.of("code", "OPEN_BACKUP_DIR_UNSUPPORTED", "platform", "ANDROID")
            );
        }

        try {
            if (Desktop.isDesktopSupported()) {
                Desktop desktop = Desktop.getDesktop();
                if (desktop.isSupported(Desktop.Action.OPEN)) {
                    desktop.open(directory.toFile());
                    return new DatabaseOpenDirectoryResponse(true, "Opened backup directory");
                }
            }
        } catch (Exception ignored) {
            // fallback below
        }

        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        try {
            Process process;
            if (os.contains("win")) {
                process = new ProcessBuilder("explorer", directory.toString()).start();
            } else if (os.contains("mac")) {
                process = new ProcessBuilder("open", directory.toString()).start();
            } else if (os.contains("nix") || os.contains("nux") || os.contains("aix")) {
                process = new ProcessBuilder("xdg-open", directory.toString()).start();
            } else {
                throw new ApiException(
                        HttpStatus.NOT_IMPLEMENTED,
                        "Open backup folder is not supported on this OS",
                        Map.of("code", "OPEN_BACKUP_DIR_UNSUPPORTED", "platform", os)
                );
            }
            if (process == null) {
                throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to open backup directory");
            }
            return new DatabaseOpenDirectoryResponse(true, "Opened backup directory");
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ApiException(
                    HttpStatus.NOT_IMPLEMENTED,
                    "Open backup folder is unavailable in current runtime",
                    Map.of("code", "OPEN_BACKUP_DIR_UNAVAILABLE", "reason", ex.getMessage())
            );
        }
    }

    public DatabaseDeleteBackupResponse deleteBackupFile(String fileName, String confirmText) {
        Path filePath = resolveBackupFilePath(fileName);
        String expectedConfirm = "DELETE BACKUP " + filePath.getFileName();
        String providedConfirm = confirmText == null ? "" : confirmText.trim();
        if (!expectedConfirm.equalsIgnoreCase(providedConfirm)) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid backup delete confirmation text",
                    Map.of("code", "INVALID_DELETE_BACKUP_CONFIRM", "expected", expectedConfirm)
            );
        }
        try {
            Files.delete(filePath);
            return new DatabaseDeleteBackupResponse(filePath.getFileName().toString(), Instant.now());
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to delete backup file");
        }
    }

    public DatabaseBackupDetailResponse getBackupDetail(String fileName) {
        return getBackupDetail(DatabaseBackupSource.LOCAL, fileName);
    }

    public DatabaseBackupDetailResponse getBackupDetail(DatabaseBackupSource source, String fileName) {
        if (source == DatabaseBackupSource.DRIVE) {
            DriveBackupFile driveBackup = resolveDriveBackupByFileName(fileName);
            return new DatabaseBackupDetailResponse(
                    driveBackup.fileName(),
                    driveBackup.remotePath(),
                    driveBackup.createdAt(),
                    DatabaseBackupSource.DRIVE.name(),
                    driveBackup.trigger(),
                    "system",
                    mongoTemplate.getDb().getName(),
                    0L,
                    List.of()
            );
        }

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
                    DatabaseBackupSource.LOCAL.name(),
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

    public DatabaseRestoreBackupResponse restoreBackup(String fileName, String actorEmail) {
        return restoreBackup(DatabaseBackupSource.LOCAL, fileName, actorEmail);
    }

    public DatabaseRestoreBackupResponse restoreBackup(DatabaseBackupSource source, String fileName, String actorEmail) {
        if (source == DatabaseBackupSource.DRIVE) {
            return restoreBackupFromDrive(fileName, actorEmail);
        }

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
                DatabaseBackupSource.LOCAL.name(),
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

    private void uploadBackupToDriveIfConfigured(Path localFile, String trigger) {
        if (driveRemote.isBlank()) {
            return;
        }
        String remoteBase = normalizedDriveRemote();
        String bucket = resolveDriveBucket(trigger);
        String remoteDir = remoteBase + "/" + bucket;
        String remotePath = remoteDir + "/" + localFile.getFileName();
        try {
            runCommand(
                    List.of("rclone", "copyto", localFile.toString(), remotePath),
                    "Failed to upload backup to Google Drive"
            );
            pruneDriveBucketIfNeeded(remoteDir, bucket);
        } catch (ApiException ex) {
            LOG.warn(
                    "Drive upload skipped due to error. localFile={}, trigger={}, message={}",
                    localFile,
                    trigger,
                    ex.getMessage()
            );
        }
    }

    private String resolveDriveBucket(String trigger) {
        String normalized = trigger == null ? "" : trigger.trim().toUpperCase(Locale.ROOT);
        if (normalized.equals("MANUAL")) {
            return "manual";
        }
        if (normalized.equals("AUTO_ON_DATABASE_UNLOCK") || normalized.equals("LOGIN")) {
            return "login";
        }
        return "auto";
    }

    private void pruneDriveBucketIfNeeded(String remoteDir, String bucket) {
        int keepCount;
        if ("auto".equals(bucket)) {
            keepCount = driveAutoRetention;
        } else if ("login".equals(bucket)) {
            keepCount = driveLoginRetention;
        } else {
            return; // manual: keep all
        }
        if (keepCount <= 0) {
            return;
        }
        List<RcloneLsjsonEntry> entries = listRemoteDirectory(remoteDir);
        List<RcloneLsjsonEntry> files = entries.stream()
                .filter(entry -> entry != null && entry.Name != null && !entry.Name.isBlank())
                .filter(entry -> {
                    String lower = entry.Name.toLowerCase(Locale.ROOT);
                    return lower.endsWith(".json") || lower.endsWith(".archive.gz");
                })
                .sorted(Comparator.comparing(entry -> parseDriveCreatedAt(entry.Name, entry.ModTime)))
                .toList();
        int removeCount = files.size() - keepCount;
        if (removeCount <= 0) {
            return;
        }
        for (int i = 0; i < removeCount; i += 1) {
            String name = files.get(i).Name;
            try {
                runCommand(List.of("rclone", "deletefile", remoteDir + "/" + name), "Failed to prune old backup on Google Drive");
            } catch (ApiException ex) {
                LOG.warn("Failed to prune drive backup {}: {}", name, ex.getMessage());
            }
        }
    }

    private List<DatabaseBackupFileSummaryResponse> listDriveBackups() {
        List<DriveBackupFile> driveFiles = listDriveBackupFiles();
        return driveFiles.stream()
                .map(file -> new DatabaseBackupFileSummaryResponse(
                        file.fileName(),
                        file.remotePath(),
                        file.createdAt(),
                        file.sizeBytes(),
                        DatabaseBackupSource.DRIVE.name(),
                        file.trigger()
                ))
                .sorted(Comparator.comparing(DatabaseBackupFileSummaryResponse::createdAt).reversed())
                .toList();
    }

    private DatabaseRestoreBackupResponse restoreBackupFromDrive(String fileName, String actorEmail) {
        DriveBackupFile driveBackup = resolveDriveBackupByFileName(fileName);
        DatabaseBackupResponse preRestoreBackup = createBackup("MANUAL", actorEmail);

        Path tempFilePath = null;
        try {
            Files.createDirectories(driveTempDir);
            tempFilePath = Files.createTempFile(driveTempDir, "restore-drive-", "-" + driveBackup.fileName());
            runCommand(List.of("rclone", "copyto", driveBackup.remotePath(), tempFilePath.toString()), "Failed to download backup from Google Drive");

            if (driveBackup.fileName().toLowerCase(Locale.ROOT).endsWith(".json")) {
                Map<String, Object> payload = readBackupPayload(tempFilePath);
                List<RestoreCollectionData> collections = readRestoreCollections(payload.get("collections"));

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
                        driveBackup.fileName(),
                        DatabaseBackupSource.DRIVE.name(),
                        Instant.now(),
                        collections.size(),
                        documentsRestored,
                        preRestoreBackup.fileName()
                );
            }

            runMongorestore(tempFilePath);
            long collectionsRestored = mongoTemplate.getCollectionNames().size();
            long documentsRestored = mongoTemplate.getCollectionNames().stream()
                    .mapToLong(name -> mongoTemplate.getCollection(name).countDocuments())
                    .sum();

            return new DatabaseRestoreBackupResponse(
                    driveBackup.fileName(),
                    DatabaseBackupSource.DRIVE.name(),
                    Instant.now(),
                    collectionsRestored,
                    documentsRestored,
                    preRestoreBackup.fileName()
            );
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to prepare restore file from Google Drive");
        } finally {
            if (tempFilePath != null) {
                try {
                    Files.deleteIfExists(tempFilePath);
                } catch (IOException ignored) {
                    // best effort
                }
            }
        }
    }

    private DriveBackupFile resolveDriveBackupByFileName(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Backup file name is required");
        }
        String normalized = fileName.trim();
        return listDriveBackupFiles().stream()
                .filter(item -> item.fileName().equals(normalized))
                .findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Backup file not found on Google Drive"));
    }

    private List<DriveBackupFile> listDriveBackupFiles() {
        String remote = normalizedDriveRemote();
        List<RcloneLsjsonEntry> entries = listRemoteDirectory(remote, true);
        return entries.stream()
                .filter(entry -> entry != null && entry.Path != null && !entry.Path.isBlank())
                .map(entry -> toDriveBackupFile(remote, entry))
                .filter(item -> item != null)
                .sorted(Comparator.comparing(DriveBackupFile::createdAt).reversed())
                .toList();
    }

    private List<RcloneLsjsonEntry> listRemoteDirectory(String remoteDir) {
        return listRemoteDirectory(remoteDir, false);
    }

    private List<RcloneLsjsonEntry> listRemoteDirectory(String remoteDir, boolean recursive) {
        List<String> command = new ArrayList<>();
        command.add("rclone");
        command.add("lsjson");
        command.add("--files-only");
        if (recursive) {
            command.add("--recursive");
        }
        command.add(remoteDir);
        String output = runCommand(command, "Failed to list backup files from Google Drive");
        try {
            return objectMapper.readValue(output, new TypeReference<List<RcloneLsjsonEntry>>() {
            });
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to parse backup file list from Google Drive");
        }
    }

    private DriveBackupFile toDriveBackupFile(String remote, RcloneLsjsonEntry entry) {
        String relativePath = entry.Path.trim();
        String fileName = entry.Name == null || entry.Name.isBlank() ? relativePath : entry.Name.trim();
        String lowerFileName = fileName.toLowerCase(Locale.ROOT);
        if (!lowerFileName.endsWith(".archive.gz") && !lowerFileName.endsWith(".json")) {
            return null;
        }

        String trigger = parseDriveTrigger(fileName, relativePath);
        Instant createdAt = parseDriveCreatedAt(fileName, entry.ModTime);
        long sizeBytes = entry.Size == null ? 0L : Math.max(0L, entry.Size);
        String remotePath = remote + "/" + relativePath;

        return new DriveBackupFile(fileName, remotePath, createdAt, sizeBytes, trigger);
    }

    private String parseLocalTrigger(String fileName) {
        Matcher matcher = LOCAL_BACKUP_PATTERN.matcher(fileName == null ? "" : fileName.trim());
        if (matcher.matches()) {
            String trigger = matcher.group(1);
            return trigger == null || trigger.isBlank() ? "UNKNOWN" : trigger.toUpperCase(Locale.ROOT);
        }
        return "UNKNOWN";
    }

    private String parseDriveTrigger(String fileName, String relativePath) {
        Matcher matcher = DRIVE_ARCHIVE_PATTERN.matcher(fileName == null ? "" : fileName.trim());
        if (matcher.matches()) {
            String trigger = matcher.group(1);
            return trigger == null ? "UNKNOWN" : trigger.toUpperCase(Locale.ROOT);
        }

        String lowerName = fileName == null ? "" : fileName.toLowerCase(Locale.ROOT);
        if (lowerName.startsWith("database-backup-auto_on_database_unlock")) {
            return "AUTO_ON_DATABASE_UNLOCK";
        }
        if (lowerName.startsWith("database-backup-auto_before_wipe_collection")) {
            return "AUTO_BEFORE_WIPE_COLLECTION";
        }
        if (lowerName.startsWith("database-backup-auto_before_wipe_database")) {
            return "AUTO_BEFORE_WIPE_DATABASE";
        }
        if (lowerName.startsWith("database-backup-auto")) {
            return "AUTO";
        }
        if (lowerName.startsWith("database-backup-manual")) {
            return "MANUAL";
        }

        String path = relativePath == null ? "" : relativePath.toLowerCase(Locale.ROOT);
        if (path.startsWith("auto/")) {
            return "AUTO";
        }
        if (path.startsWith("login/")) {
            return "LOGIN";
        }
        if (path.startsWith("manual/")) {
            return "MANUAL";
        }
        return "UNKNOWN";
    }

    private Instant parseDriveCreatedAt(String fileName, String modTime) {
        Matcher matcher = DRIVE_ARCHIVE_PATTERN.matcher(fileName == null ? "" : fileName.trim());
        if (matcher.matches()) {
            String raw = matcher.group(2);
            if (raw != null && !raw.isBlank()) {
                try {
                    return DRIVE_FILE_TIME_FORMAT.parse(raw, Instant::from);
                } catch (DateTimeParseException ignored) {
                    // fallback below
                }
            }
        }

        Matcher localMatcher = LOCAL_BACKUP_PATTERN.matcher(fileName == null ? "" : fileName.trim());
        if (localMatcher.matches()) {
            String raw = localMatcher.group(2);
            if (raw != null && !raw.isBlank()) {
                try {
                    LocalDateTime dateTime = LocalDateTime.parse(raw, FILE_TIME_FORMAT);
                    return dateTime.atZone(ZoneId.systemDefault()).toInstant();
                } catch (DateTimeParseException ignored) {
                    // fallback below
                }
                try {
                    LocalDateTime dateTime = LocalDateTime.parse(raw, LOCAL_FILE_TIME_PARSER);
                    return dateTime.atZone(ZoneId.systemDefault()).toInstant();
                } catch (DateTimeParseException ignored) {
                    // fallback below
                }
            }
        }

        if (modTime != null && !modTime.isBlank()) {
            try {
                return Instant.parse(modTime.trim());
            } catch (DateTimeParseException ignored) {
                // fallback below
            }
        }
        return Instant.now();
    }

    private void runMongorestore(Path archivePath) {
        runCommand(
                List.of(
                        "mongorestore",
                        "--uri=" + mongoUri,
                        "--archive",
                        "--gzip",
                        "--drop"
                ),
                archivePath,
                "Failed to restore backup archive"
        );
    }

    private String runCommand(List<String> command, String failureMessage) {
        ProcessBuilder processBuilder = new ProcessBuilder(command);
        return executeProcess(processBuilder, failureMessage);
    }

    private String runCommand(List<String> command, Path stdinFile, String failureMessage) {
        ProcessBuilder processBuilder = new ProcessBuilder(command);
        processBuilder.redirectInput(stdinFile.toFile());
        return executeProcess(processBuilder, failureMessage);
    }

    private String executeProcess(ProcessBuilder processBuilder, String failureMessage) {
        processBuilder.redirectErrorStream(true);
        Process process;
        try {
            process = processBuilder.start();
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, failureMessage + ": command is unavailable");
        }

        String output;
        try (InputStream inputStream = process.getInputStream();
             ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
            inputStream.transferTo(buffer);
            output = buffer.toString();
        } catch (IOException ex) {
            process.destroyForcibly();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, failureMessage + ": unable to read process output");
        }

        boolean finished;
        try {
            finished = process.waitFor(driveCommandTimeoutSeconds, TimeUnit.SECONDS);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, failureMessage + ": process interrupted");
        }

        if (!finished) {
            process.destroyForcibly();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, failureMessage + ": command timed out");
        }

        if (process.exitValue() != 0) {
            String cleaned = output == null ? "" : output.trim();
            throw new ApiException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    cleaned.isBlank() ? failureMessage : failureMessage + ": " + cleaned
            );
        }
        return output == null ? "" : output;
    }

    private String normalizedDriveRemote() {
        if (driveRemote.isBlank()) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "Google Drive remote is not configured. Set EMBE_DATABASE_DRIVE_REMOTE."
            );
        }
        return driveRemote.endsWith("/") ? driveRemote.substring(0, driveRemote.length() - 1) : driveRemote;
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
                sizeBytes,
                DatabaseBackupSource.LOCAL.name(),
                parseLocalTrigger(path.getFileName().toString())
        );
    }

    private Path backupDirectory() {
        return Paths.get(backupDir).toAbsolutePath().normalize();
    }

    private boolean isAndroidRuntime() {
        String vmName = System.getProperty("java.vm.name", "").toLowerCase(Locale.ROOT);
        String runtimeName = System.getProperty("java.runtime.name", "").toLowerCase(Locale.ROOT);
        return vmName.contains("dalvik") || runtimeName.contains("android");
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
        String value = trigger.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9_]", "_");
        if (value.isBlank()) {
            return "MANUAL";
        }
        return value;
    }

    private record DriveBackupFile(
            String fileName,
            String remotePath,
            Instant createdAt,
            long sizeBytes,
            String trigger
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private static class RcloneLsjsonEntry {
        public String Path;
        public String Name;
        public Long Size;
        public String ModTime;
    }

    private record RestoreCollectionData(String name, List<Document> documents) {
    }
}
