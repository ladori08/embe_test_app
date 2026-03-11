package com.embe.backend.product;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

@RestController
@RequestMapping("/api/products/public")
public class ProductPublicController {

    private final ProductService productService;
    private final ProductStockEventBroadcaster productStockEventBroadcaster;

    public ProductPublicController(ProductService productService, ProductStockEventBroadcaster productStockEventBroadcaster) {
        this.productService = productService;
        this.productStockEventBroadcaster = productStockEventBroadcaster;
    }

    @GetMapping
    public List<ProductResponse> list() {
        return productService.listActive();
    }

    @GetMapping("/{id}")
    public ProductResponse get(@PathVariable String id) {
        return productService.getById(id);
    }

    @GetMapping(value = "/stock-events", produces = "text/event-stream")
    public SseEmitter stockEvents() {
        return productStockEventBroadcaster.subscribe();
    }
}
