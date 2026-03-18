package com.embe.backend.product;

import com.embe.backend.common.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

@Service
public class ProductImageStorageService {

    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif", "avif", "jfif");
    private static final String PUBLIC_PATH_PREFIX = "/api/uploads/product-images/";

    private final Path storageDir;

    public ProductImageStorageService(@Value("${embe.product-images.storage-dir:uploads/product-images}") String rawStorageDir) {
        this.storageDir = Paths.get(rawStorageDir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.storageDir);
        } catch (IOException ex) {
            throw new IllegalStateException("Cannot initialize product image storage directory", ex);
        }
    }

    public ProductImageUploadResponse store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Image file is required");
        }
        String extension = resolveExtension(file.getOriginalFilename());
        String fileName = Instant.now().toEpochMilli() + "-" + UUID.randomUUID().toString().replace("-", "") + "." + extension;
        Path target = resolveTargetPath(fileName);

        try (InputStream input = file.getInputStream()) {
            Files.copy(input, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to store product image");
        }

        String path = PUBLIC_PATH_PREFIX + fileName;
        return new ProductImageUploadResponse(fileName, path, path);
    }

    public List<ProductMediaImageResponse> listImages() {
        try (Stream<Path> files = Files.list(storageDir)) {
            return files
                    .filter(Files::isRegularFile)
                    .map(this::toMediaImage)
                    .flatMap(Optional::stream)
                    .sorted(Comparator.comparing(ProductMediaImageResponse::lastModified).reversed())
                    .toList();
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to load media images");
        }
    }

    public void delete(String fileName) {
        Path target = resolveTargetPath(sanitizeFileName(fileName));
        if (!Files.exists(target) || !Files.isRegularFile(target)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Image not found");
        }
        try {
            Files.delete(target);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to delete image");
        }
    }

    public Resource loadAsResource(String fileName) {
        Path target = resolveTargetPath(sanitizeFileName(fileName));
        if (!Files.exists(target) || !Files.isRegularFile(target)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Image not found");
        }
        return new FileSystemResource(target);
    }

    public MediaType resolveMediaType(String fileName) {
        Path target = resolveTargetPath(sanitizeFileName(fileName));
        try {
            String contentType = Files.probeContentType(target);
            if (contentType != null && !contentType.isBlank()) {
                return MediaType.parseMediaType(contentType);
            }
        } catch (IOException ignored) {
            // fallback to extension detection
        }
        String extension = resolveExtension(fileName);
        return switch (extension) {
            case "png" -> MediaType.IMAGE_PNG;
            case "gif" -> MediaType.IMAGE_GIF;
            case "webp" -> MediaType.parseMediaType("image/webp");
            case "bmp" -> MediaType.parseMediaType("image/bmp");
            case "heic" -> MediaType.parseMediaType("image/heic");
            case "heif" -> MediaType.parseMediaType("image/heif");
            case "avif" -> MediaType.parseMediaType("image/avif");
            default -> MediaType.IMAGE_JPEG;
        };
    }

    private Path resolveTargetPath(String fileName) {
        Path target = storageDir.resolve(fileName).normalize();
        if (!target.startsWith(storageDir)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid file path");
        }
        return target;
    }

    private String sanitizeFileName(String fileName) {
        String name = fileName == null ? "" : fileName.trim();
        if (name.isBlank() || name.contains("/") || name.contains("\\") || name.contains("..")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid file name");
        }
        return name;
    }

    private String resolveExtension(String originalName) {
        String raw = originalName == null ? "" : originalName.trim();
        if (raw.isBlank()) {
            raw = "image.jpg";
        }
        String normalized = raw.replace("\\", "/");
        int slashIndex = normalized.lastIndexOf('/');
        String name = sanitizeFileName(slashIndex >= 0 ? normalized.substring(slashIndex + 1) : normalized);
        int dotIndex = name.lastIndexOf('.');
        if (dotIndex < 0 || dotIndex == name.length() - 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Image file extension is required");
        }
        String extension = name.substring(dotIndex + 1).toLowerCase(Locale.ROOT);
        if (!ALLOWED_EXTENSIONS.contains(extension)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported image extension: " + extension);
        }
        return extension;
    }

    private Optional<ProductMediaImageResponse> toMediaImage(Path filePath) {
        String fileName = filePath.getFileName().toString();
        try {
            resolveExtension(fileName);
            long sizeBytes = Files.size(filePath);
            Instant lastModified = Files.getLastModifiedTime(filePath).toInstant();
            String path = PUBLIC_PATH_PREFIX + fileName;
            return Optional.of(new ProductMediaImageResponse(fileName, path, path, sizeBytes, lastModified));
        } catch (Exception ignored) {
            return Optional.empty();
        }
    }
}
