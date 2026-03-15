package com.embe.backend.database;

import jakarta.validation.Valid;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/admin/database")
@PreAuthorize("hasRole('SUPERADMIN')")
public class DatabaseConsoleController {

    private static final String ACCESS_TOKEN_HEADER = "X-Database-Access-Token";

    private final DatabaseConsoleService databaseConsoleService;

    public DatabaseConsoleController(DatabaseConsoleService databaseConsoleService) {
        this.databaseConsoleService = databaseConsoleService;
    }

    @PostMapping("/unlock")
    public DatabaseUnlockResponse unlock(@Valid @RequestBody DatabaseUnlockRequest request) {
        return databaseConsoleService.unlock(request.password());
    }

    @GetMapping("/collections")
    public List<DatabaseCollectionResponse> listCollections(
            @RequestHeader(name = ACCESS_TOKEN_HEADER) String accessToken
    ) {
        return databaseConsoleService.listCollections(accessToken);
    }

    @GetMapping("/collections/{collection}/fields")
    public DatabaseCollectionFieldsResponse listCollectionFields(
            @RequestHeader(name = ACCESS_TOKEN_HEADER) String accessToken,
            @PathVariable String collection
    ) {
        return databaseConsoleService.listCollectionFields(accessToken, collection);
    }

    @PostMapping("/query")
    public DatabaseQueryResponse query(
            @RequestHeader(name = ACCESS_TOKEN_HEADER) String accessToken,
            @Valid @RequestBody DatabaseQueryRequest request
    ) {
        return databaseConsoleService.query(accessToken, request);
    }

    @PostMapping("/dependencies/check")
    public DatabaseDependencyCheckResponse checkDependencies(
            @RequestHeader(name = ACCESS_TOKEN_HEADER) String accessToken,
            @Valid @RequestBody DatabaseDependencyCheckRequest request
    ) {
        return databaseConsoleService.checkDependencies(accessToken, request.collection(), request.documentId());
    }

    @PostMapping("/dependencies/resolve")
    public DatabaseDependencyResolveResponse resolveDependencies(
            @RequestHeader(name = ACCESS_TOKEN_HEADER) String accessToken,
            @Valid @RequestBody DatabaseDependencyResolveRequest request
    ) {
        return databaseConsoleService.resolveDependencies(accessToken, request);
    }

    @PostMapping("/wipe")
    public DatabaseWipeResponse wipe(
            @RequestHeader(name = ACCESS_TOKEN_HEADER) String accessToken,
            @Valid @RequestBody DatabaseWipeRequest request
    ) {
        return databaseConsoleService.wipe(accessToken, request);
    }

    @PutMapping("/documents/{collection}/{id}")
    public DatabaseQueryRow updateDocument(
            @RequestHeader(name = ACCESS_TOKEN_HEADER) String accessToken,
            @PathVariable String collection,
            @PathVariable String id,
            @Valid @RequestBody DatabaseDocumentUpdateRequest request
    ) {
        return databaseConsoleService.updateDocument(accessToken, collection, id, request);
    }

    @DeleteMapping("/documents/{collection}/{id}")
    public void deleteDocument(
            @RequestHeader(name = ACCESS_TOKEN_HEADER) String accessToken,
            @PathVariable String collection,
            @PathVariable String id
    ) {
        databaseConsoleService.deleteDocument(accessToken, collection, id);
    }

    @PostMapping("/backup")
    public DatabaseBackupResponse backup(
            @RequestHeader(name = ACCESS_TOKEN_HEADER) String accessToken
    ) {
        return databaseConsoleService.backup(accessToken);
    }

    @GetMapping("/backups")
    public List<DatabaseBackupFileSummaryResponse> listBackups(
            @RequestHeader(name = ACCESS_TOKEN_HEADER) String accessToken
    ) {
        return databaseConsoleService.listBackups(accessToken);
    }

    @GetMapping("/backups/{fileName:.+}")
    public DatabaseBackupDetailResponse backupDetail(
            @RequestHeader(name = ACCESS_TOKEN_HEADER) String accessToken,
            @PathVariable String fileName
    ) {
        return databaseConsoleService.getBackupDetail(accessToken, fileName);
    }

    @PostMapping("/backups/restore")
    public DatabaseRestoreBackupResponse restoreBackup(
            @RequestHeader(name = ACCESS_TOKEN_HEADER) String accessToken,
            @Valid @RequestBody DatabaseRestoreBackupRequest request
    ) {
        return databaseConsoleService.restoreBackup(accessToken, request.fileName());
    }

    @PostMapping("/export")
    public ResponseEntity<byte[]> export(
            @RequestHeader(name = ACCESS_TOKEN_HEADER) String accessToken,
            @RequestParam(defaultValue = "csv") String format,
            @Valid @RequestBody DatabaseExportRequest request
    ) {
        DatabaseExportPayload payload = databaseConsoleService.export(accessToken, format, request);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentDisposition(ContentDisposition.attachment()
                .filename(payload.fileName(), StandardCharsets.UTF_8)
                .build());
        headers.setContentType(MediaType.parseMediaType(payload.contentType()));
        return ResponseEntity.ok()
                .headers(headers)
                .body(payload.bytes());
    }
}
