package com.embe.backend.product;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProductLotServiceTest {

    @Test
    void shouldConsumeLotsByFifoOrder() {
        ProductLotRepository repository = mock(ProductLotRepository.class);
        ProductLotService service = new ProductLotService(repository);

        ProductLot lot1 = new ProductLot();
        lot1.setId("l1");
        lot1.setProductId("p1");
        lot1.setLotCode("PLOT-OLD");
        lot1.setRemainingQty(new BigDecimal("2"));
        lot1.setUnitCost(new BigDecimal("65000"));
        lot1.setProducedAt(Instant.parse("2026-03-01T00:00:00Z"));

        ProductLot lot2 = new ProductLot();
        lot2.setId("l2");
        lot2.setProductId("p1");
        lot2.setLotCode("PLOT-NEW");
        lot2.setRemainingQty(new BigDecimal("2"));
        lot2.setUnitCost(new BigDecimal("70000"));
        lot2.setProducedAt(Instant.parse("2026-03-02T00:00:00Z"));

        when(repository.findByProductIdOrderByProducedAtAscCreatedAtAsc("p1")).thenReturn(List.of(lot1, lot2));
        when(repository.save(any(ProductLot.class))).thenAnswer(invocation -> invocation.getArgument(0));

        List<ProductLotAllocation> allocations = service.consumeLots("p1", new BigDecimal("3"));

        assertEquals(2, allocations.size());
        assertEquals("PLOT-OLD", allocations.get(0).getLotCode());
        assertEquals(new BigDecimal("2"), allocations.get(0).getQty());
        assertEquals(new BigDecimal("130000"), allocations.get(0).getSubtotalCost());
        assertEquals("PLOT-NEW", allocations.get(1).getLotCode());
        assertEquals(new BigDecimal("1"), allocations.get(1).getQty());
        assertEquals(new BigDecimal("70000"), allocations.get(1).getSubtotalCost());
        assertEquals(new BigDecimal("0"), lot1.getRemainingQty());
        assertEquals(new BigDecimal("1"), lot2.getRemainingQty());
        verify(repository, times(2)).save(any(ProductLot.class));
    }
}
