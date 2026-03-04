package com.embe.backend.category;

import com.embe.backend.common.ApiException;
import com.embe.backend.product.Product;
import com.embe.backend.product.ProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProductCategoryServiceTest {

    @Mock
    private ProductCategoryRepository categoryRepository;
    @Mock
    private ProductRepository productRepository;

    private ProductCategoryService categoryService;

    @BeforeEach
    void setUp() {
        categoryService = new ProductCategoryService(categoryRepository, productRepository);
    }

    @Test
    void shouldCreateCategoryAndGenerateSku() {
        when(categoryRepository.findByNameKey("pastry")).thenReturn(Optional.empty());
        when(categoryRepository.findBySkuStartingWith("PASTR-")).thenReturn(List.of());
        when(categoryRepository.save(any(ProductCategory.class))).thenAnswer(invocation -> {
            ProductCategory saved = invocation.getArgument(0);
            saved.setId("c1");
            saved.setCreatedAt(Instant.now());
            saved.setUpdatedAt(Instant.now());
            return saved;
        });

        ProductCategoryResponse response = categoryService.create(new ProductCategoryRequest("  Pastry  "));

        assertEquals("Pastry", response.name());
        assertEquals("PASTR-00001", response.sku());
    }

    @Test
    void shouldUpdateCategoryAndKeepOldSkuAsLegacy() {
        ProductCategory existing = new ProductCategory();
        existing.setId("c1");
        existing.setName("Coffee");
        existing.setNameKey("coffee");
        existing.setSku("COFFE-00001");
        existing.setLegacySkus(List.of());
        existing.setCreatedAt(Instant.now());
        existing.setUpdatedAt(Instant.now());

        Product linkedProduct = new Product();
        linkedProduct.setId("p1");
        linkedProduct.setCategory("Coffee");

        when(categoryRepository.findById("c1")).thenReturn(Optional.of(existing));
        when(categoryRepository.findByNameKey("matcha")).thenReturn(Optional.empty());
        when(categoryRepository.findBySkuStartingWith("MATCH-")).thenReturn(List.of());
        when(categoryRepository.save(any(ProductCategory.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(productRepository.findByCategoryIgnoreCase("Coffee")).thenReturn(List.of(linkedProduct));

        ProductCategoryResponse response = categoryService.update("c1", new ProductCategoryRequest("Matcha"));

        assertEquals("Matcha", response.name());
        assertEquals("MATCH-00001", response.sku());
        assertEquals(List.of("COFFE-00001"), response.legacySkus());
        verify(productRepository).saveAll(any());
    }

    @Test
    void shouldRejectDeleteWhenCategoryIsUsedByProducts() {
        ProductCategory existing = new ProductCategory();
        existing.setId("c1");
        existing.setName("Pastry");

        when(categoryRepository.findById("c1")).thenReturn(Optional.of(existing));
        when(productRepository.countByCategoryIgnoreCase("Pastry")).thenReturn(2L);

        assertThrows(ApiException.class, () -> categoryService.delete("c1"));
        verify(categoryRepository, never()).delete(any(ProductCategory.class));
    }

    @Test
    void shouldBackfillCategoriesFromLegacyProductsWhenListing() {
        Product product = new Product();
        product.setCategory("Bánh ngọt");

        ProductCategory stored = new ProductCategory();
        stored.setId("c1");
        stored.setName("Bánh ngọt");
        stored.setNameKey("bánh ngọt");
        stored.setSku("BNANH-00001");
        stored.setLegacySkus(List.of());
        stored.setCreatedAt(Instant.now());
        stored.setUpdatedAt(Instant.now());

        when(productRepository.findAll()).thenReturn(List.of(product));
        when(categoryRepository.findByNameKey("bánh ngọt")).thenReturn(Optional.empty());
        when(categoryRepository.findBySkuStartingWith("BNANH-")).thenReturn(List.of());
        when(categoryRepository.save(any(ProductCategory.class))).thenReturn(stored);
        when(categoryRepository.findAllByOrderByNameAsc()).thenReturn(List.of(stored));

        List<ProductCategoryResponse> categories = categoryService.list();

        assertEquals(1, categories.size());
        assertEquals("Bánh ngọt", categories.get(0).name());
        verify(categoryRepository).findByNameKey(eq("bánh ngọt"));
    }
}
