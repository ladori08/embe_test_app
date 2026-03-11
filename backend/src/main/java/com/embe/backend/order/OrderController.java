package com.embe.backend.order;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping
    public OrderResponse create(
            @Valid @RequestBody CreateOrderRequest request,
            @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyKey
    ) {
        return orderService.createOrder(request, idempotencyKey);
    }

    @GetMapping
    public List<OrderResponse> listMine() {
        return orderService.listMyOrders();
    }

    @GetMapping("/{id}")
    public OrderResponse get(@PathVariable String id) {
        return orderService.getMine(id);
    }
}
