package com.embe.backend.order;

import com.embe.backend.auth.AuthService;
import com.embe.backend.audit.AuditAction;
import com.embe.backend.audit.AuditLogService;
import com.embe.backend.audit.AuditModule;
import com.embe.backend.common.ApiException;
import com.embe.backend.product.Product;
import com.embe.backend.product.ProductStockEventBroadcaster;
import com.embe.backend.product.ProductService;
import com.embe.backend.product.ProductStockLogType;
import com.embe.backend.stock.InventoryMutationService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class OrderService {

    private static final int RECIPIENT_NAME_MAX_LENGTH = 120;
    private static final int RECIPIENT_PHONE_MIN_LENGTH = 8;
    private static final int RECIPIENT_PHONE_MAX_LENGTH = 20;
    private static final int DELIVERY_ADDRESS_MIN_LENGTH = 5;
    private static final int DELIVERY_ADDRESS_MAX_LENGTH = 255;
    private static final int NOTE_MAX_LENGTH = 500;
    private static final int IDEMPOTENCY_KEY_MAX_LENGTH = 128;
    public static final long ORDER_HOLD_MINUTES = 30;
    private static final Pattern PHONE_PATTERN = Pattern.compile("^\\+?[0-9][0-9\\-()\\s]{6,18}[0-9]$");

    private final OrderRepository orderRepository;
    private final ProductService productService;
    private final InventoryMutationService inventoryMutationService;
    private final AuthService authService;
    private final AuditLogService auditLogService;
    private final ProductStockEventBroadcaster productStockEventBroadcaster;

    public OrderService(
            OrderRepository orderRepository,
            ProductService productService,
            InventoryMutationService inventoryMutationService,
            AuthService authService,
            AuditLogService auditLogService,
            ProductStockEventBroadcaster productStockEventBroadcaster
    ) {
        this.orderRepository = orderRepository;
        this.productService = productService;
        this.inventoryMutationService = inventoryMutationService;
        this.authService = authService;
        this.auditLogService = auditLogService;
        this.productStockEventBroadcaster = productStockEventBroadcaster;
    }

    @Transactional
    public OrderResponse createOrder(CreateOrderRequest request, String rawIdempotencyKey) {
        String userId = optionalCurrentUserId();
        String recipientName = sanitizeRequiredText(request.recipientName(), "Recipient name is required");
        String recipientPhone = sanitizeRequiredText(request.recipientPhone(), "Recipient phone is required");
        String deliveryAddress = sanitizeRequiredText(request.deliveryAddress(), "Delivery address is required");
        String note = sanitizeOptionalText(request.note());
        String idempotencyKey = sanitizeIdempotencyKey(rawIdempotencyKey);

        if (idempotencyKey != null) {
            Order existing = orderRepository.findByIdempotencyKey(idempotencyKey).orElse(null);
            if (existing != null) {
                return toResponse(existing);
            }
        }

        if (recipientName.length() > RECIPIENT_NAME_MAX_LENGTH) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Recipient name must be at most " + RECIPIENT_NAME_MAX_LENGTH + " characters");
        }
        if (recipientPhone.length() < RECIPIENT_PHONE_MIN_LENGTH || recipientPhone.length() > RECIPIENT_PHONE_MAX_LENGTH) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "Recipient phone must be " + RECIPIENT_PHONE_MIN_LENGTH + "-" + RECIPIENT_PHONE_MAX_LENGTH + " characters"
            );
        }
        if (!PHONE_PATTERN.matcher(recipientPhone).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Recipient phone format is invalid");
        }
        if (deliveryAddress.length() < DELIVERY_ADDRESS_MIN_LENGTH || deliveryAddress.length() > DELIVERY_ADDRESS_MAX_LENGTH) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "Delivery address must be " + DELIVERY_ADDRESS_MIN_LENGTH + "-" + DELIVERY_ADDRESS_MAX_LENGTH + " characters"
            );
        }
        if (note != null && note.length() > NOTE_MAX_LENGTH) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Note must be at most " + NOTE_MAX_LENGTH + " characters");
        }

        Map<String, BigDecimal> qtyByProductId = new LinkedHashMap<>();
        for (CreateOrderItemRequest itemRequest : request.items()) {
            String productId = sanitizeRequiredText(itemRequest.productId(), "Product ID is required");
            qtyByProductId.merge(productId, itemRequest.qty(), BigDecimal::add);
        }

        List<OrderItem> items = new ArrayList<>();
        List<StockAdjustmentDetail> shortages = new ArrayList<>();
        Set<String> changedProductIds = new HashSet<>();

        for (Map.Entry<String, BigDecimal> entry : qtyByProductId.entrySet()) {
            Product product = productService.getEntity(entry.getKey());
            if (Boolean.FALSE.equals(product.getActive())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Product is inactive: " + product.getName());
            }

            BigDecimal requestedQty = entry.getValue();
            boolean deducted = inventoryMutationService.deductProductIfEnough(product.getId(), requestedQty);
            if (!deducted) {
                Product fresh = productService.getEntity(product.getId());
                BigDecimal availableQty = normalizeNonNegative(fresh.getCurrentStock());
                shortages.add(new StockAdjustmentDetail(
                        fresh.getId(),
                        fresh.getName(),
                        requestedQty,
                        availableQty
                ));
                continue;
            }
            changedProductIds.add(product.getId());

            OrderItem item = new OrderItem();
            item.setProductId(product.getId());
            item.setName(product.getName());
            item.setPrice(product.getPrice());
            item.setQty(requestedQty);
            items.add(item);
        }

        if (!shortages.isEmpty()) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "Insufficient stock for one or more products",
                    Map.of(
                            "code", "INSUFFICIENT_STOCK",
                            "adjustments", shortages
                    )
            );
        }

        BigDecimal subtotal = items.stream()
                .map(item -> item.getPrice().multiply(item.getQty()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal tax = BigDecimal.ZERO;

        Order order = new Order();
        order.setUserId(userId);
        order.setItems(items);
        order.setStatus(OrderStatus.NEW);
        order.setRecipientName(recipientName);
        order.setRecipientPhone(recipientPhone);
        order.setDeliveryAddress(deliveryAddress);
        order.setNote(note);
        order.setIdempotencyKey(idempotencyKey);
        order.setSubtotal(subtotal);
        order.setTax(tax);
        order.setTotal(subtotal.add(tax));
        order.setStockDeducted(true);
        Instant now = Instant.now();
        order.setCreatedAt(now);
        order.setUpdatedAt(now);
        order.setHoldExpiresAt(now.plus(ORDER_HOLD_MINUTES, ChronoUnit.MINUTES));
        order.setCancelReason(null);

        Order saved;
        try {
            saved = orderRepository.save(order);
        } catch (DataIntegrityViolationException ex) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "Idempotency key is already in use",
                    Map.of("code", "IDEMPOTENCY_KEY_CONFLICT")
            );
        }
        for (OrderItem item : saved.getItems()) {
            productService.saveStockLog(item.getProductId(), ProductStockLogType.OUT, item.getQty(), "Order placed reserve", saved.getId(), currentUser());
        }
        publishStockChangesAfterCommit(changedProductIds);

        OrderResponse response = toResponse(saved);
        auditLogService.record(
                AuditModule.ORDER,
                AuditAction.CREATE,
                "Created order " + response.id(),
                response.id(),
                null,
                response,
                java.util.Map.of(
                        "status", response.status().name(),
                        "stockReserved", true
                )
        );
        return response;
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
        if (!authService.isAdmin()) {
            if (order.getUserId() == null || !order.getUserId().equals(authService.currentUserId())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Order does not belong to current user");
            }
        }
        return toResponse(order);
    }

    @Transactional
    public OrderResponse updateStatus(String id, UpdateOrderStatusRequest request) {
        Order order = getEntity(id);
        OrderResponse before = toResponse(order);
        OrderStatus target = request.status();
        Set<String> changedProductIds = new HashSet<>();

        if (target == order.getStatus()) {
            return before;
        }

        if (target == OrderStatus.CONFIRMED && !order.isStockDeducted()) {
            for (OrderItem item : order.getItems()) {
                boolean ok = inventoryMutationService.deductProductIfEnough(item.getProductId(), item.getQty());
                if (!ok) {
                    throw new ApiException(HttpStatus.CONFLICT, "Insufficient product stock for " + item.getName());
                }
                productService.saveStockLog(item.getProductId(), ProductStockLogType.OUT, item.getQty(), "Order confirmed", order.getId(), currentUser());
                changedProductIds.add(item.getProductId());
            }
            order.setStockDeducted(true);
        }

        if (target == OrderStatus.CANCELLED && order.isStockDeducted()) {
            changedProductIds.addAll(cancelAndRestoreStock(order, "MANUAL_CANCEL", currentUser(), "Order cancelled restore"));
        } else if (target == OrderStatus.CANCELLED) {
            order.setCancelReason("MANUAL_CANCEL");
            order.setHoldExpiresAt(null);
        }

        order.setStatus(target);
        if (target == OrderStatus.CONFIRMED) {
            order.setCancelReason(null);
            if (order.getHoldExpiresAt() == null) {
                order.setHoldExpiresAt(order.getCreatedAt() == null ? Instant.now().plus(ORDER_HOLD_MINUTES, ChronoUnit.MINUTES) : order.getCreatedAt().plus(ORDER_HOLD_MINUTES, ChronoUnit.MINUTES));
            }
        }
        if (target != OrderStatus.NEW && target != OrderStatus.CANCELLED) {
            order.setHoldExpiresAt(null);
        }
        order.setUpdatedAt(Instant.now());
        OrderResponse after = toResponse(orderRepository.save(order));

        publishStockChangesAfterCommit(changedProductIds);

        auditLogService.record(
                AuditModule.ORDER,
                AuditAction.STATUS_CHANGE,
                "Updated order status " + before.status() + " -> " + after.status(),
                order.getId(),
                before,
                after,
                java.util.Map.of(
                        "fromStatus", before.status().name(),
                        "toStatus", after.status().name(),
                        "cancelReason", Objects.toString(order.getCancelReason(), "")
                )
        );

        return after;
    }

    @Transactional
    public int cancelExpiredOrders() {
        Instant now = Instant.now();
        List<Order> expiredOrders = orderRepository.findByStatusAndStockDeductedTrueAndHoldExpiresAtBefore(OrderStatus.NEW, now);
        int cancelled = 0;
        for (Order order : expiredOrders) {
            OrderResponse before = toResponse(order);
            Set<String> changedProductIds = cancelAndRestoreStock(order, "TTL_EXPIRED", "system", "Order hold expired restore");
            order.setStatus(OrderStatus.CANCELLED);
            order.setHoldExpiresAt(null);
            order.setUpdatedAt(now);
            Order saved = orderRepository.save(order);
            publishStockChangesAfterCommit(changedProductIds);
            OrderResponse after = toResponse(saved);
            auditLogService.record(
                    AuditModule.ORDER,
                    AuditAction.STATUS_CHANGE,
                    "Order auto-cancelled due to TTL expiry",
                    saved.getId(),
                    before,
                    after,
                    Map.of(
                            "fromStatus", before.status().name(),
                            "toStatus", after.status().name(),
                            "cancelReason", "TTL_EXPIRED"
                    )
            );
            cancelled++;
        }
        return cancelled;
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
                order.getRecipientName(),
                order.getRecipientPhone(),
                order.getDeliveryAddress(),
                order.getNote(),
                order.getSubtotal(),
                order.getTax(),
                order.getTotal(),
                order.isStockDeducted(),
                order.getCreatedAt(),
                order.getUpdatedAt()
        );
    }

    private String optionalCurrentUserId() {
        try {
            return authService.currentUserId();
        } catch (Exception ignored) {
            return null;
        }
    }

    private String currentUser() {
        try {
            return authService.currentUserId();
        } catch (Exception ignored) {
            return "system";
        }
    }

    private String sanitizeRequiredText(String value, String requiredMessage) {
        String normalized = sanitizeOptionalText(value);
        if (normalized == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, requiredMessage);
        }
        return normalized;
    }

    private String sanitizeOptionalText(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String sanitizeIdempotencyKey(String value) {
        String normalized = sanitizeOptionalText(value);
        if (normalized == null) {
            return null;
        }
        if (normalized.length() > IDEMPOTENCY_KEY_MAX_LENGTH) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Idempotency key must be at most " + IDEMPOTENCY_KEY_MAX_LENGTH + " characters");
        }
        return normalized;
    }

    private BigDecimal normalizeNonNegative(BigDecimal value) {
        if (value == null || value.compareTo(BigDecimal.ZERO) < 0) {
            return BigDecimal.ZERO;
        }
        return value;
    }

    private Set<String> cancelAndRestoreStock(Order order, String cancelReason, String actor, String stockLogNote) {
        Set<String> changedProductIds = new HashSet<>();
        if (!order.isStockDeducted()) {
            order.setCancelReason(cancelReason);
            order.setHoldExpiresAt(null);
            return changedProductIds;
        }

        for (OrderItem item : order.getItems()) {
            inventoryMutationService.addProduct(item.getProductId(), item.getQty());
            productService.saveStockLog(item.getProductId(), ProductStockLogType.RESTORE, item.getQty(), stockLogNote, order.getId(), actor);
            changedProductIds.add(item.getProductId());
        }
        order.setStockDeducted(false);
        order.setCancelReason(cancelReason);
        order.setHoldExpiresAt(null);
        return changedProductIds;
    }

    private void publishStockChangesAfterCommit(Set<String> productIds) {
        if (productIds == null || productIds.isEmpty()) {
            return;
        }
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            for (String productId : productIds) {
                Product product = productService.getEntity(productId);
                productStockEventBroadcaster.publish(productId, normalizeNonNegative(product.getCurrentStock()));
            }
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                for (String productId : productIds) {
                    Product product = productService.getEntity(productId);
                    productStockEventBroadcaster.publish(productId, normalizeNonNegative(product.getCurrentStock()));
                }
            }
        });
    }
}
