package com.embe.backend.order;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class OrderExpiryScheduler {

    private static final Logger log = LoggerFactory.getLogger(OrderExpiryScheduler.class);

    private final OrderService orderService;

    public OrderExpiryScheduler(OrderService orderService) {
        this.orderService = orderService;
    }

    @Scheduled(fixedDelayString = "${app.orders.expiry-check-ms:60000}")
    public void expireHeldOrders() {
        int cancelledCount = orderService.cancelExpiredOrders();
        if (cancelledCount > 0) {
            log.info("Auto-cancelled {} expired held order(s)", cancelledCount);
        }
    }
}
