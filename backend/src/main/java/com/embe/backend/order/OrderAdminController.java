package com.embe.backend.order;

import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/admin/orders")
public class OrderAdminController {

    private final OrderService orderService;

    public OrderAdminController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping
    public List<OrderResponse> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String buyerName,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to
    ) {
        return orderService.listAll(status, buyerName, from, to);
    }

    @PatchMapping("/{id}/status")
    public OrderResponse updateStatus(@PathVariable String id, @Valid @RequestBody UpdateOrderStatusRequest request) {
        return orderService.updateStatus(id, request);
    }

    @GetMapping("/{id}/timeline")
    public List<OrderStatusTimelineResponse> timeline(@PathVariable String id) {
        return orderService.listStatusTimeline(id);
    }
}
