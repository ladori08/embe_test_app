package com.embe.backend.product;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class ProductStockEventBroadcaster {

    private static final Logger log = LoggerFactory.getLogger(ProductStockEventBroadcaster.class);

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(0L);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> {
            emitters.remove(emitter);
            emitter.complete();
        });
        emitter.onError(ex -> emitters.remove(emitter));

        try {
            emitter.send(SseEmitter.event().name("connected").data("ok"));
        } catch (IOException ex) {
            emitters.remove(emitter);
            emitter.completeWithError(ex);
        }

        return emitter;
    }

    public void publish(String productId, BigDecimal currentStock) {
        ProductStockEvent event = new ProductStockEvent(productId, currentStock, Instant.now());
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name("stock_changed").data(event));
            } catch (IOException ex) {
                emitters.remove(emitter);
                try {
                    emitter.completeWithError(ex);
                } catch (Exception completionEx) {
                    log.debug("Failed to complete SSE emitter after send error", completionEx);
                }
            }
        }
    }
}
