package com.embe.backend.order;

import com.embe.backend.auth.AuthService;
import com.embe.backend.common.ApiException;
import com.embe.backend.product.Product;
import com.embe.backend.product.ProductService;
import com.embe.backend.product.ProductStockLogType;
import com.embe.backend.stock.InventoryMutationService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final ProductService productService;
    private final InventoryMutationService inventoryMutationService;
    private final AuthService authService;

    public OrderService(
            OrderRepository orderRepository,
            ProductService productService,
            InventoryMutationService inventoryMutationService,
            AuthService authService
    ) {
        this.orderRepository = orderRepository;
        this.productService = productService;
        this.inventoryMutationService = inventoryMutationService;
        this.authService = authService;
    }

    @Transactional
    public OrderResponse createOrder(CreateOrderRequest request) {
        String userId = authService.currentUserId();

        List<OrderItem> items = request.items().stream().map(itemRequest -> {
            Product product = productService.getEntity(itemRequest.productId());
            if (Boolean.FALSE.equals(product.getActive())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Product is inactive: " + product.getName());
            }
            OrderItem item = new OrderItem();
            item.setProductId(product.getId());
            item.setName(product.getName());
            item.setPrice(product.getPrice());
            item.setQty(itemRequest.qty());
            return item;
        }).toList();

        BigDecimal subtotal = items.stream()
                .map(item -> item.getPrice().multiply(item.getQty()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal tax = request.tax() == null ? BigDecimal.ZERO : request.tax();

        Order order = new Order();
        order.setUserId(userId);
        order.setItems(items);
        order.setStatus(OrderStatus.NEW);
        order.setSubtotal(subtotal);
        order.setTax(tax);
        order.setTotal(subtotal.add(tax));
        order.setStockDeducted(false);
        Instant now = Instant.now();
        order.setCreatedAt(now);
        order.setUpdatedAt(now);

        return toResponse(orderRepository.save(order));
    }

    public List<OrderResponse> listMyOrders() {
        String userId = authService.currentUserId();
        return orderRepository.findByUserIdOrderByCreatedAtDesc(userId).stream().map(this::toResponse).toList();
    }

    public List<OrderResponse> listAll() {
        return orderRepository.findAllByOrderByCreatedAtDesc().stream().map(this::toResponse).toList();
    }

    public OrderResponse getMine(String id) {
        Order order = getEntity(id);
        if (!authService.isAdmin() && !order.getUserId().equals(authService.currentUserId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Order does not belong to current user");
        }
        return toResponse(order);
    }

    @Transactional
    public OrderResponse updateStatus(String id, UpdateOrderStatusRequest request) {
        Order order = getEntity(id);
        OrderStatus target = request.status();

        if (target == order.getStatus()) {
            return toResponse(order);
        }

        if (target == OrderStatus.CONFIRMED && !order.isStockDeducted()) {
            for (OrderItem item : order.getItems()) {
                boolean ok = inventoryMutationService.deductProductIfEnough(item.getProductId(), item.getQty());
                if (!ok) {
                    throw new ApiException(HttpStatus.CONFLICT, "Insufficient product stock for " + item.getName());
                }
                productService.saveStockLog(item.getProductId(), ProductStockLogType.OUT, item.getQty(), "Order confirmed", order.getId(), currentUser());
            }
            order.setStockDeducted(true);
        }

        if (target == OrderStatus.CANCELLED && order.isStockDeducted()) {
            for (OrderItem item : order.getItems()) {
                inventoryMutationService.addProduct(item.getProductId(), item.getQty());
                productService.saveStockLog(item.getProductId(), ProductStockLogType.RESTORE, item.getQty(), "Order cancelled restore", order.getId(), currentUser());
            }
            order.setStockDeducted(false);
        }

        order.setStatus(target);
        order.setUpdatedAt(Instant.now());
        return toResponse(orderRepository.save(order));
    }

    public Order getEntity(String id) {
        return orderRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Order not found"));
    }

    private OrderResponse toResponse(Order order) {
        return new OrderResponse(
                order.getId(),
                order.getUserId(),
                order.getItems().stream().map(item -> new OrderItemResponse(item.getProductId(), item.getName(), item.getPrice(), item.getQty())).toList(),
                order.getStatus(),
                order.getSubtotal(),
                order.getTax(),
                order.getTotal(),
                order.isStockDeducted(),
                order.getCreatedAt(),
                order.getUpdatedAt()
        );
    }

    private String currentUser() {
        try {
            return authService.currentUserId();
        } catch (Exception ignored) {
            return "system";
        }
    }
}
