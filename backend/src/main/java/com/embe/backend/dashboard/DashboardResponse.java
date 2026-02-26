package com.embe.backend.dashboard;

import java.math.BigDecimal;
import java.util.List;

public record DashboardResponse(
        long totalOrders,
        BigDecimal revenue,
        BigDecimal estimatedCost,
        BigDecimal estimatedProfit,
        long lowStockIngredients,
        long bakesLast7Days,
        long bakesLast30Days,
        List<StatusCount> statusBreakdown,
        List<RevenuePoint> revenueLast7Days
) {
}
