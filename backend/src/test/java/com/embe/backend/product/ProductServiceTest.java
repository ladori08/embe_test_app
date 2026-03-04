package com.embe.backend.product;

import com.embe.backend.category.ProductCategoryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProductServiceTest {

    @Mock
    private ProductRepository productRepository;
    @Mock
    private ProductStockLogRepository productStockLogRepository;
    @Mock
    private ProductCategoryService productCategoryService;

    private ProductService productService;

    @BeforeEach
    void setUp() {
        productService = new ProductService(productRepository, productStockLogRepository, productCategoryService);
    }

    @Test
    void shouldPreviewNextSkuFromCategoryPrefixAndSequence() {
        Product p1 = new Product();
        p1.setSku("BNANH-00008");
        Product p2 = new Product();
        p2.setSku("BNANH-ABCD");
        when(productCategoryService.requireExistingCategoryName("Bánh ngọt")).thenReturn("Bánh ngọt");
        when(productRepository.findBySkuStartingWith("BNANH-")).thenReturn(List.of(p1, p2));

        String next = productService.previewNextSku("Bánh ngọt");

        assertEquals("BNANH-00009", next);
    }

    @Test
    void shouldRetryWhenSkuCollisionHappensOnCreate() {
        Product existing = new Product();
        existing.setSku("CPDAH-00001");
        when(productCategoryService.requireExistingCategoryName("Cà phê đá")).thenReturn("Cà phê đá");
        when(productRepository.findBySkuStartingWith("CPDAH-")).thenReturn(List.of(existing));

        AtomicInteger saveCalls = new AtomicInteger(0);
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> {
            Product product = invocation.getArgument(0);
            if (saveCalls.getAndIncrement() == 0) {
                assertEquals("CPDAH-00002", product.getSku());
                throw new DataIntegrityViolationException("duplicate key error");
            }
            assertEquals("CPDAH-00003", product.getSku());
            product.setId("p1");
            product.setCreatedAt(Instant.now());
            product.setUpdatedAt(Instant.now());
            return product;
        });

        ProductResponse response = productService.create(new ProductRequest(
                "Ca phe da",
                null,
                "Cà phê đá",
                new BigDecimal("2.50"),
                new BigDecimal("1.10"),
                BigDecimal.ZERO,
                true,
                List.of(),
                null
        ));

        assertEquals("CPDAH-00003", response.sku());
        verify(productRepository, times(2)).save(any(Product.class));
    }

    @Test
    void shouldKeepExistingSkuWhenUpdateRequestSkuIsBlank() {
        Product existing = new Product();
        existing.setId("p1");
        existing.setSku("CAFFE-00012");
        existing.setCategory("Coffee");
        existing.setCreatedAt(Instant.now());
        existing.setUpdatedAt(Instant.now());
        when(productCategoryService.requireExistingCategoryNameOrCurrent("Coffee", "Coffee")).thenReturn("Coffee");
        when(productRepository.findById("p1")).thenReturn(Optional.of(existing));
        when(productRepository.findBySkuIgnoreCase("CAFFE-00012")).thenReturn(Optional.of(existing));
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ProductResponse response = productService.update("p1", new ProductRequest(
                "Cafe sua",
                "",
                "Coffee",
                new BigDecimal("3.20"),
                new BigDecimal("1.00"),
                new BigDecimal("12"),
                true,
                List.of(),
                null
        ));

        assertEquals("CAFFE-00012", response.sku());
        verify(productRepository).findBySkuIgnoreCase(eq("CAFFE-00012"));
    }

    @Test
    void shouldRegenerateSkuOnUpdateWhenRequested() {
        Product existing = new Product();
        existing.setId("p1");
        existing.setSku("CAFFE-00012");
        existing.setCategory("Coffee");
        existing.setCreatedAt(Instant.now());
        existing.setUpdatedAt(Instant.now());

        Product samePrefix = new Product();
        samePrefix.setSku("PASTR-00004");

        when(productRepository.findById("p1")).thenReturn(Optional.of(existing));
        when(productCategoryService.requireExistingCategoryNameOrCurrent("Pastry", "Coffee")).thenReturn("Pastry");
        when(productRepository.findBySkuStartingWith("PASTR-")).thenReturn(List.of(samePrefix));
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ProductResponse response = productService.update("p1", new ProductRequest(
                "Butter Croissant",
                "",
                "Pastry",
                new BigDecimal("3.50"),
                new BigDecimal("1.30"),
                new BigDecimal("10"),
                true,
                List.of(),
                true
        ));

        assertEquals("PASTR-00005", response.sku());
    }
}
