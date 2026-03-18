package com.embe.backend.product;

import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;
import java.util.List;

@RestController
public class ProductImageController {

    private final ProductImageStorageService productImageStorageService;

    public ProductImageController(ProductImageStorageService productImageStorageService) {
        this.productImageStorageService = productImageStorageService;
    }

    @PostMapping(value = "/api/admin/products/images/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ProductImageUploadResponse upload(@RequestPart("file") MultipartFile file) {
        return productImageStorageService.store(file);
    }

    @GetMapping("/api/admin/media/images")
    public List<ProductMediaImageResponse> listImages() {
        return productImageStorageService.listImages();
    }

    @DeleteMapping("/api/admin/media/images/{fileName:.+}")
    public ResponseEntity<Void> deleteImage(@PathVariable String fileName) {
        productImageStorageService.delete(fileName);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/uploads/product-images/{fileName:.+}")
    public ResponseEntity<Resource> view(@PathVariable String fileName) {
        Resource resource = productImageStorageService.loadAsResource(fileName);
        MediaType mediaType = productImageStorageService.resolveMediaType(fileName);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic())
                .contentType(mediaType)
                .body(resource);
    }
}
