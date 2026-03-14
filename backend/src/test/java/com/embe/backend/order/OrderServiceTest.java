package com.embe.backend.order;

import com.embe.backend.auth.AuthService;
import com.embe.backend.audit.AuditLogService;
import com.embe.backend.common.ApiException;
import com.embe.backend.product.Product;
import com.embe.backend.product.ProductLotService;
import com.embe.backend.product.ProductStockEventBroadcaster;
import com.embe.backend.product.ProductService;
import com.embe.backend.stock.InventoryMutationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;
    @Mock
    private ProductService productService;
    @Mock
    private ProductLotService productLotService;
    @Mock
    private InventoryMutationService inventoryMutationService;
    @Mock
    private AuthService authService;
    @Mock
    private AuditLogService auditLogService;
    @Mock
    private ProductStockEventBroadcaster productStockEventBroadcaster;

    private OrderService orderService;

    @BeforeEach
    void setUp() {
        orderService = new OrderService(orderRepository, productService, productLotService, inventoryMutationService, authService, auditLogService, productStockEventBroadcaster, null);
    }

    @Test
    void shouldCreateOrderWithCalculatedTotal() {
        Product product = new Product();
        product.setId("p1");
        product.setName("Croissant");
        product.setPrice(new BigDecimal("3.50"));
        product.setCurrentStock(new BigDecimal("10"));
        product.setActive(true);

        when(authService.currentUserId()).thenReturn("u1");
        when(productService.getEntity("p1")).thenReturn(product);
        when(inventoryMutationService.deductProductIfEnough("p1", new BigDecimal("2"))).thenReturn(true);
        when(productLotService.consumeLots("p1", new BigDecimal("2"))).thenReturn(List.of());
        when(productLotService.estimateCost(any())).thenReturn(BigDecimal.ZERO);
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> {
            Order order = invocation.getArgument(0);
            order.setId("o1");
            order.setCreatedAt(Instant.now());
            order.setUpdatedAt(Instant.now());
            return order;
        });

        OrderResponse response = orderService.createOrder(new CreateOrderRequest(
                List.of(new CreateOrderItemRequest("p1", new BigDecimal("2"))),
                "Alice",
                "0901234567",
                "123 Test Street",
                "Leave at door"
        ), null);

        assertEquals(new BigDecimal("7.00"), response.subtotal());
        assertEquals(BigDecimal.ZERO, response.tax());
        assertEquals(new BigDecimal("7.00"), response.total());
        assertEquals(OrderStatus.NEW, response.status());
        assertEquals("Alice", response.recipientName());
        assertTrue(response.stockDeducted());
    }

    @Test
    void shouldRejectOrderWhenStockInsufficientOnCreate() {
        Product product = new Product();
        product.setId("p1");
        product.setName("Croissant");
        product.setPrice(new BigDecimal("3.50"));
        product.setCurrentStock(new BigDecimal("1"));
        product.setActive(true);

        when(productService.getEntity("p1")).thenReturn(product);

        assertThrows(
                ApiException.class,
                () -> orderService.createOrder(new CreateOrderRequest(
                        List.of(new CreateOrderItemRequest("p1", new BigDecimal("2"))),
                        "Alice",
                        "0901234567",
                        "123 Test Street",
                        null
                ), null)
        );
    }

    @Test
    void shouldAggregateDuplicateOrderLinesWhenCreatingOrder() {
        Product product = new Product();
        product.setId("p1");
        product.setName("Croissant");
        product.setPrice(new BigDecimal("3.50"));
        product.setCurrentStock(new BigDecimal("10"));
        product.setActive(true);

        when(authService.currentUserId()).thenReturn("u1");
        when(productService.getEntity("p1")).thenReturn(product);
        when(inventoryMutationService.deductProductIfEnough("p1", new BigDecimal("3"))).thenReturn(true);
        when(productLotService.consumeLots("p1", new BigDecimal("3"))).thenReturn(List.of());
        when(productLotService.estimateCost(any())).thenReturn(BigDecimal.ZERO);
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> {
            Order order = invocation.getArgument(0);
            order.setId("o1");
            order.setCreatedAt(Instant.now());
            order.setUpdatedAt(Instant.now());
            return order;
        });

        OrderResponse response = orderService.createOrder(new CreateOrderRequest(
                List.of(
                        new CreateOrderItemRequest("p1", new BigDecimal("1")),
                        new CreateOrderItemRequest("p1", new BigDecimal("2"))
                ),
                "Alice",
                "0901234567",
                "123 Test Street",
                null
        ), null);

        assertEquals(1, response.items().size());
        assertEquals(new BigDecimal("3"), response.items().get(0).qty());
        assertEquals(new BigDecimal("10.50"), response.subtotal());
        assertEquals(new BigDecimal("10.50"), response.total());
    }

    @Test
    void shouldDeductStockWhenConfirmed() {
        Order order = new Order();
        order.setId("o1");
        order.setStatus(OrderStatus.NEW);
        order.setStockDeducted(false);
        OrderItem item = new OrderItem();
        item.setProductId("p1");
        item.setName("Croissant");
        item.setQty(new BigDecimal("2"));
        item.setPrice(new BigDecimal("3.50"));
        order.setItems(List.of(item));
        order.setSubtotal(new BigDecimal("7.00"));
        order.setTax(BigDecimal.ZERO);
        order.setTotal(new BigDecimal("7.00"));
        order.setCreatedAt(Instant.now());
        order.setUpdatedAt(Instant.now());

        when(orderRepository.findById("o1")).thenReturn(Optional.of(order));
        when(inventoryMutationService.deductProductIfEnough(eq("p1"), eq(new BigDecimal("2")))).thenReturn(true);
        when(productLotService.consumeLots("p1", new BigDecimal("2"))).thenReturn(List.of());
        when(productLotService.estimateCost(any())).thenReturn(BigDecimal.ZERO);
        Product updatedProduct = new Product();
        updatedProduct.setId("p1");
        updatedProduct.setCurrentStock(new BigDecimal("8"));
        when(productService.getEntity("p1")).thenReturn(updatedProduct);
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(authService.currentUserId()).thenReturn("admin-user");

        OrderResponse response = orderService.updateStatus("o1", new UpdateOrderStatusRequest(OrderStatus.CONFIRMED));

        assertEquals(OrderStatus.CONFIRMED, response.status());
        assertTrue(response.stockDeducted());
    }

    @Test
    void shouldThrowWhenInsufficientStockOnConfirm() {
        Order order = new Order();
        order.setId("o1");
        order.setStatus(OrderStatus.NEW);
        order.setStockDeducted(false);
        OrderItem item = new OrderItem();
        item.setProductId("p1");
        item.setName("Croissant");
        item.setQty(new BigDecimal("2"));
        item.setPrice(new BigDecimal("3.50"));
        order.setItems(List.of(item));
        order.setSubtotal(new BigDecimal("7.00"));
        order.setTax(BigDecimal.ZERO);
        order.setTotal(new BigDecimal("7.00"));
        order.setCreatedAt(Instant.now());
        order.setUpdatedAt(Instant.now());

        when(orderRepository.findById("o1")).thenReturn(Optional.of(order));
        when(inventoryMutationService.deductProductIfEnough(eq("p1"), eq(new BigDecimal("2")))).thenReturn(false);

        assertThrows(ApiException.class, () -> orderService.updateStatus("o1", new UpdateOrderStatusRequest(OrderStatus.CONFIRMED)));
    }
}
