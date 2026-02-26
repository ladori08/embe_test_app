package com.embe.backend.dashboard;

import com.embe.backend.bake.BakeRepository;
import com.embe.backend.ingredient.Ingredient;
import com.embe.backend.ingredient.IngredientRepository;
import com.embe.backend.order.Order;
import com.embe.backend.order.OrderRepository;
import com.embe.backend.order.OrderStatus;
import com.embe.backend.product.Product;
import com.embe.backend.product.ProductRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

@Service
public class DashboardService {

    private final OrderRepository orderRepository;
    private final IngredientRepository ingredientRepository;
    private final BakeRepository bakeRepository;
    private final ProductRepository productRepository;

    public DashboardService(
            OrderRepository orderRepository,
            IngredientRepository ingredientRepository,
            BakeRepository bakeRepository,
            ProductRepository productRepository
    ) {
        this.orderRepository = orderRepository;
        this.ingredientRepository = ingredientRepository;
        this.bakeRepository = bakeRepository;
        this.productRepository = productRepository;
    }

    public DashboardResponse getDashboard() {
        List<Order> orders = orderRepository.findAllByOrderByCreatedAtDesc();
        Map<String, Product> productCostIndex = new java.util.HashMap<>();
        for (Product product : productRepository.findAll()) {
            productCostIndex.put(product.getId(), product);
        }

        Predicate<Order> revenueEligible = o -> o.getStatus() == OrderStatus.CONFIRMED || o.getStatus() == OrderStatus.PAID || o.getStatus() == OrderStatus.COMPLETED;

        BigDecimal revenue = orders.stream()
                .filter(revenueEligible)
                .map(Order::getTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal estimatedCost = BigDecimal.ZERO;
        for (Order order : orders) {
            if (!revenueEligible.test(order)) {
                continue;
            }
            for (var item : order.getItems()) {
                Product product = productCostIndex.get(item.getProductId());
                BigDecimal cost = product == null || product.getCost() == null ? BigDecimal.ZERO : product.getCost();
                estimatedCost = estimatedCost.add(cost.multiply(item.getQty()));
            }
        }

        BigDecimal estimatedProfit = revenue.subtract(estimatedCost);

        long lowStockCount = ingredientRepository.findAll().stream()
                .filter(this::isLowStock)
                .count();

        long bakes7 = bakeRepository.countByCreatedAtAfter(Instant.now().minusSeconds(7L * 24 * 3600));
        long bakes30 = bakeRepository.countByCreatedAtAfter(Instant.now().minusSeconds(30L * 24 * 3600));

        Map<OrderStatus, Long> statusCount = new EnumMap<>(OrderStatus.class);
        for (OrderStatus status : OrderStatus.values()) {
            statusCount.put(status, 0L);
        }
        for (Order order : orders) {
            statusCount.compute(order.getStatus(), (k, v) -> v == null ? 1L : v + 1L);
        }

        List<StatusCount> statusBreakdown = statusCount.entrySet().stream()
                .map(e -> new StatusCount(e.getKey().name(), e.getValue()))
                .toList();

        List<RevenuePoint> revenueLast7Days = new ArrayList<>();
        for (int i = 6; i >= 0; i--) {
            LocalDate day = LocalDate.now(ZoneOffset.UTC).minusDays(i);
            Instant start = day.atStartOfDay().toInstant(ZoneOffset.UTC);
            Instant end = day.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
            BigDecimal dayRevenue = orders.stream()
                    .filter(revenueEligible)
                    .filter(order -> !order.getCreatedAt().isBefore(start) && order.getCreatedAt().isBefore(end))
                    .map(Order::getTotal)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            revenueLast7Days.add(new RevenuePoint(day.toString(), dayRevenue));
        }

        return new DashboardResponse(
                orders.size(),
                revenue,
                estimatedCost,
                estimatedProfit,
                lowStockCount,
                bakes7,
                bakes30,
                statusBreakdown,
                revenueLast7Days
        );
    }

    private boolean isLowStock(Ingredient ingredient) {
        if (ingredient.getReorderLevel() == null) {
            return false;
        }
        return ingredient.getCurrentStock().compareTo(ingredient.getReorderLevel()) <= 0;
    }
}
