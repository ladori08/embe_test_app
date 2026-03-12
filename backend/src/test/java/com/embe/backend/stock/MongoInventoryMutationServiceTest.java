package com.embe.backend.stock;

import com.embe.backend.product.Product;
import com.mongodb.client.result.UpdateResult;
import org.bson.BsonDocument;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MongoInventoryMutationServiceTest {

    @Test
    void shouldRetryWriteConflictAndEventuallySucceed() {
        MongoTemplate mongoTemplate = mock(MongoTemplate.class);
        MongoInventoryMutationService service = new MongoInventoryMutationService(mongoTemplate);

        when(mongoTemplate.updateFirst(any(Query.class), any(Update.class), eq(Product.class)))
                .thenThrow(new DataIntegrityViolationException("Write conflict during update"))
                .thenReturn(UpdateResult.acknowledged(1L, 1L, new BsonDocument()));

        boolean deducted = service.deductProductIfEnough("p1", BigDecimal.ONE);

        assertTrue(deducted);
        verify(mongoTemplate, times(2)).updateFirst(any(Query.class), any(Update.class), eq(Product.class));
    }

    @Test
    void shouldPropagateNonRetryableDataAccessException() {
        MongoTemplate mongoTemplate = mock(MongoTemplate.class);
        MongoInventoryMutationService service = new MongoInventoryMutationService(mongoTemplate);

        when(mongoTemplate.updateFirst(any(Query.class), any(Update.class), eq(Product.class)))
                .thenThrow(new DataIntegrityViolationException("Some other data issue"));

        assertThrows(DataIntegrityViolationException.class, () -> service.deductProductIfEnough("p1", BigDecimal.ONE));
        verify(mongoTemplate, times(1)).updateFirst(any(Query.class), any(Update.class), eq(Product.class));
    }
}
