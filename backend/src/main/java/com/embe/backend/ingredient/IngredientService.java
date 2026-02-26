package com.embe.backend.ingredient;

import com.embe.backend.auth.AuthService;
import com.embe.backend.common.ApiException;
import com.embe.backend.recipe.RecipeRepository;
import com.embe.backend.stock.InventoryMutationService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;

@Service
public class IngredientService {

    private final IngredientRepository ingredientRepository;
    private final StockTransactionRepository stockTransactionRepository;
    private final RecipeRepository recipeRepository;
    private final InventoryMutationService inventoryMutationService;
    private final AuthService authService;

    public IngredientService(
            IngredientRepository ingredientRepository,
            StockTransactionRepository stockTransactionRepository,
            RecipeRepository recipeRepository,
            InventoryMutationService inventoryMutationService,
            AuthService authService
    ) {
        this.ingredientRepository = ingredientRepository;
        this.stockTransactionRepository = stockTransactionRepository;
        this.recipeRepository = recipeRepository;
        this.inventoryMutationService = inventoryMutationService;
        this.authService = authService;
    }

    public List<IngredientResponse> list() {
        return ingredientRepository.findAll().stream()
                .sorted(Comparator.comparing(Ingredient::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toResponse)
                .toList();
    }

    public IngredientResponse get(String id) {
        return toResponse(getEntity(id));
    }

    public IngredientResponse create(IngredientRequest request) {
        ingredientRepository.findByNameIgnoreCase(request.name()).ifPresent(existing -> {
            throw new ApiException(HttpStatus.CONFLICT, "Ingredient name already exists");
        });

        Ingredient ingredient = new Ingredient();
        apply(ingredient, request);
        Instant now = Instant.now();
        ingredient.setCreatedAt(now);
        ingredient.setUpdatedAt(now);

        Ingredient saved = ingredientRepository.save(ingredient);
        if (saved.getCurrentStock().compareTo(BigDecimal.ZERO) > 0) {
            recordStockTransaction(saved.getId(), StockTransactionType.IN, saved.getCurrentStock(), null, "Initial stock", currentUser());
        }
        return toResponse(saved);
    }

    public IngredientResponse update(String id, IngredientRequest request) {
        Ingredient ingredient = getEntity(id);
        ingredientRepository.findByNameIgnoreCase(request.name())
                .filter(existing -> !existing.getId().equals(id))
                .ifPresent(existing -> {
                    throw new ApiException(HttpStatus.CONFLICT, "Ingredient name already exists");
                });

        apply(ingredient, request);
        ingredient.setUpdatedAt(Instant.now());
        return toResponse(ingredientRepository.save(ingredient));
    }

    public void delete(String id, boolean force) {
        Ingredient ingredient = getEntity(id);
        if (!force && recipeRepository.existsByItemsIngredientId(id)) {
            throw new ApiException(HttpStatus.CONFLICT, "Ingredient is used in recipes. Use force=true to delete.");
        }
        ingredientRepository.delete(ingredient);
    }

    @Transactional
    public IngredientResponse adjustStock(String id, StockAdjustmentRequest request) {
        getEntity(id);
        boolean ok;
        if (request.type() == StockTransactionType.IN) {
            inventoryMutationService.addIngredient(id, request.qty());
            ok = true;
        } else {
            ok = inventoryMutationService.deductIngredientIfEnough(id, request.qty());
        }

        if (!ok) {
            throw new ApiException(HttpStatus.CONFLICT, "Insufficient stock for adjustment");
        }

        recordStockTransaction(id, request.type(), request.qty(), request.unitCost(), request.note(), currentUser());
        return toResponse(getEntity(id));
    }

    public List<StockTransaction> listTransactions(String ingredientId) {
        getEntity(ingredientId);
        return stockTransactionRepository.findByIngredientIdOrderByCreatedAtDesc(ingredientId);
    }

    @Transactional
    public CsvImportResult importCsv(MultipartFile file) {
        int imported = 0;
        int skipped = 0;

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream()))) {
            String line;
            boolean first = true;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                if (first) {
                    first = false;
                    if (line.toLowerCase().contains("name") && line.toLowerCase().contains("unit")) {
                        continue;
                    }
                }
                String[] parts = line.split(",");
                if (parts.length < 3) {
                    skipped++;
                    continue;
                }

                String name = parts[0].trim();
                if (name.isEmpty() || ingredientRepository.findByNameIgnoreCase(name).isPresent()) {
                    skipped++;
                    continue;
                }

                String unit = parts[1].trim().toLowerCase();
                BigDecimal stock;
                try {
                    stock = new BigDecimal(parts[2].trim());
                } catch (NumberFormatException e) {
                    skipped++;
                    continue;
                }
                BigDecimal reorder = parts.length > 3 && !parts[3].trim().isEmpty() ? new BigDecimal(parts[3].trim()) : BigDecimal.ZERO;

                Ingredient ingredient = new Ingredient();
                ingredient.setName(name);
                ingredient.setUnit(unit);
                ingredient.setCurrentStock(stock);
                ingredient.setReorderLevel(reorder);
                ingredient.setCostTrackingMethod("AVG_BIN");
                Instant now = Instant.now();
                ingredient.setCreatedAt(now);
                ingredient.setUpdatedAt(now);
                Ingredient saved = ingredientRepository.save(ingredient);
                imported++;

                if (stock.compareTo(BigDecimal.ZERO) > 0) {
                    recordStockTransaction(saved.getId(), StockTransactionType.IN, stock, null, "CSV initial stock", currentUser());
                }
            }
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Failed to parse CSV file");
        }

        return new CsvImportResult(imported, skipped);
    }

    public Ingredient getEntity(String id) {
        return ingredientRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Ingredient not found"));
    }

    public void recordStockTransaction(String ingredientId, StockTransactionType type, BigDecimal qty, BigDecimal unitCost, String note, String createdBy) {
        StockTransaction tx = new StockTransaction();
        tx.setIngredientId(ingredientId);
        tx.setType(type);
        tx.setQty(qty);
        tx.setUnitCost(unitCost);
        tx.setNote(note);
        tx.setCreatedAt(Instant.now());
        tx.setCreatedBy(createdBy);
        stockTransactionRepository.save(tx);
    }

    private void apply(Ingredient ingredient, IngredientRequest request) {
        ingredient.setName(request.name().trim());
        ingredient.setUnit(request.unit().toLowerCase());
        ingredient.setCurrentStock(request.currentStock() == null ? BigDecimal.ZERO : request.currentStock());
        ingredient.setReorderLevel(request.reorderLevel() == null ? BigDecimal.ZERO : request.reorderLevel());
        ingredient.setCostTrackingMethod(request.costTrackingMethod() == null || request.costTrackingMethod().isBlank() ? "AVG_BIN" : request.costTrackingMethod());
    }

    private IngredientResponse toResponse(Ingredient ingredient) {
        return new IngredientResponse(
                ingredient.getId(),
                ingredient.getName(),
                ingredient.getUnit(),
                ingredient.getCurrentStock(),
                ingredient.getReorderLevel(),
                ingredient.getCostTrackingMethod(),
                ingredient.getCreatedAt(),
                ingredient.getUpdatedAt()
        );
    }

    private String currentUser() {
        try {
            return authService.currentUserId();
        } catch (Exception ignored) {
            return "system";
        }
    }
}
