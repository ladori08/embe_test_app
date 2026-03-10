package com.embe.backend.ingredient;

import com.embe.backend.audit.AuditAction;
import com.embe.backend.audit.AuditLogService;
import com.embe.backend.audit.AuditModule;
import com.embe.backend.auth.AuthService;
import com.embe.backend.common.ApiException;
import com.embe.backend.recipe.RecipeRepository;
import com.embe.backend.stock.InventoryMutationService;
import com.embe.backend.user.UserAccount;
import com.embe.backend.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.text.Normalizer;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class IngredientService {

    private static final BigDecimal UNIT_SCALE = new BigDecimal("1000");
    private static final int DEFAULT_TX_LIMIT = 300;
    private static final int MAX_TX_LIMIT = 1000;
    private static final int INGREDIENT_CODE_PREFIX_LENGTH = 4;
    private static final int INGREDIENT_CODE_SEQUENCE_DIGITS = 5;
    private static final int INGREDIENT_CODE_MAX_RETRIES = 1000;
    private static final String INGREDIENT_CODE_FALLBACK_PREFIX = "INGR";

    private final IngredientRepository ingredientRepository;
    private final StockTransactionRepository stockTransactionRepository;
    private final RecipeRepository recipeRepository;
    private final InventoryMutationService inventoryMutationService;
    private final MongoTemplate mongoTemplate;
    private final UserRepository userRepository;
    private final AuthService authService;
    private final AuditLogService auditLogService;

    public IngredientService(
            IngredientRepository ingredientRepository,
            StockTransactionRepository stockTransactionRepository,
            RecipeRepository recipeRepository,
            InventoryMutationService inventoryMutationService,
            MongoTemplate mongoTemplate,
            UserRepository userRepository,
            AuthService authService,
            AuditLogService auditLogService
    ) {
        this.ingredientRepository = ingredientRepository;
        this.stockTransactionRepository = stockTransactionRepository;
        this.recipeRepository = recipeRepository;
        this.inventoryMutationService = inventoryMutationService;
        this.mongoTemplate = mongoTemplate;
        this.userRepository = userRepository;
        this.authService = authService;
        this.auditLogService = auditLogService;
    }

    public List<IngredientResponse> list() {
        List<Ingredient> ingredients = ingredientRepository.findAll();
        ingredients.forEach(this::ensureIngredientCode);
        return ingredients.stream()
                .sorted(Comparator.comparing(Ingredient::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toResponse)
                .toList();
    }

    public IngredientResponse get(String id) {
        Ingredient ingredient = getEntity(id);
        ensureIngredientCode(ingredient);
        return toResponse(ingredient);
    }

    public IngredientResponse create(IngredientRequest request) {
        ingredientRepository.findByNameIgnoreCase(request.name()).ifPresent(existing -> {
            throw new ApiException(HttpStatus.CONFLICT, "Ingredient name already exists");
        });
        if (request.currentStock() != null && request.currentStock().compareTo(BigDecimal.ZERO) > 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Create ingredient with zero stock, then use stock-in with total cost");
        }

        Ingredient ingredient = new Ingredient();
        apply(ingredient, request);
        ingredient.setIngredientCode(resolveIngredientCodeForCreate(request.ingredientCode(), request.name()));
        Instant now = Instant.now();
        ingredient.setCreatedAt(now);
        ingredient.setUpdatedAt(now);

        Ingredient saved = ingredientRepository.save(ingredient);
        IngredientResponse response = toResponse(saved);
        auditLogService.record(
                AuditModule.INGREDIENT,
                AuditAction.CREATE,
                "Created ingredient " + response.name(),
                response.id(),
                null,
                response,
                java.util.Map.of("unit", response.unit(), "ingredientCode", response.ingredientCode())
        );
        return response;
    }

    public IngredientResponse update(String id, IngredientRequest request) {
        Ingredient ingredient = getEntity(id);
        IngredientResponse before = toResponse(ingredient);
        ingredientRepository.findByNameIgnoreCase(request.name())
                .filter(existing -> !existing.getId().equals(id))
                .ifPresent(existing -> {
                    throw new ApiException(HttpStatus.CONFLICT, "Ingredient name already exists");
                });

        apply(ingredient, request);
        String requestedCode = normalizeIngredientCode(request.ingredientCode());
        if (!requestedCode.isBlank()) {
            ingredientRepository.findByIngredientCodeIgnoreCase(requestedCode)
                    .filter(existing -> !existing.getId().equals(id))
                    .ifPresent(existing -> {
                        throw new ApiException(HttpStatus.CONFLICT, "Ingredient code already exists");
                    });
            ingredient.setIngredientCode(requestedCode);
        } else if (ingredient.getIngredientCode() == null || ingredient.getIngredientCode().isBlank()) {
            ingredient.setIngredientCode(generateUniqueIngredientCode(ingredient.getName()));
        }
        ingredient.setUpdatedAt(Instant.now());
        IngredientResponse after = toResponse(ingredientRepository.save(ingredient));
        auditLogService.record(
                AuditModule.INGREDIENT,
                AuditAction.UPDATE,
                "Updated ingredient " + after.name(),
                after.id(),
                before,
                after,
                java.util.Map.of("unit", after.unit(), "ingredientCode", after.ingredientCode())
        );
        return after;
    }

    public void delete(String id, boolean force) {
        Ingredient ingredient = getEntity(id);
        IngredientResponse before = toResponse(ingredient);
        if (!force && recipeRepository.existsByItemsIngredientId(id)) {
            throw new ApiException(HttpStatus.CONFLICT, "Ingredient is used in recipes. Use force=true to delete.");
        }
        ingredientRepository.delete(ingredient);
        auditLogService.record(
                AuditModule.INGREDIENT,
                AuditAction.DELETE,
                "Deleted ingredient " + before.name(),
                before.id(),
                before,
                null,
                java.util.Map.of("force", force)
        );
    }

    @Transactional
    public IngredientResponse adjustStock(String id, StockAdjustmentRequest request) {
        Ingredient ingredient = getEntity(id);
        String inputUnit = resolveInputUnit(ingredient.getUnit(), request.inputUnit());
        BigDecimal qtyBase = toBaseQty(ingredient.getUnit(), inputUnit, request.qty());
        BigDecimal unitCostBase = null;
        BigDecimal totalCostInput = null;
        if (request.type() == StockTransactionType.IN) {
            if (request.totalCost() != null && request.totalCost().compareTo(BigDecimal.ZERO) > 0) {
                totalCostInput = request.totalCost();
            } else {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Total cost is required and must be greater than 0 for stock-in");
            }
            unitCostBase = toBaseUnitCostFromTotal(qtyBase, totalCostInput);
        }
        boolean ok;
        if (request.type() == StockTransactionType.IN) {
            inventoryMutationService.addIngredient(id, qtyBase);
            ok = true;
        } else {
            ok = inventoryMutationService.deductIngredientIfEnough(id, qtyBase);
        }

        if (!ok) {
            throw new ApiException(HttpStatus.CONFLICT, "Insufficient stock for adjustment");
        }

        List<StockLotAllocation> allocations = request.type() == StockTransactionType.OUT
                ? consumeLots(id, qtyBase)
                : List.of();

        recordStockTransaction(
                id,
                ingredient.getName(),
                request.type(),
                qtyBase,
                inputUnit,
                unitCostBase,
                request.note(),
                currentUser(),
                allocations
        );
        IngredientResponse after = toResponse(getEntity(id));
        Map<String, Object> metadata = new java.util.LinkedHashMap<>();
        metadata.put("type", request.type().name());
        metadata.put("inputQty", request.qty());
        metadata.put("inputUnit", inputUnit);
        metadata.put("qtyBase", qtyBase);
        metadata.put("totalCostInput", totalCostInput);
        metadata.put("unitCostBase", unitCostBase);
        metadata.put("note", request.note() == null ? "" : request.note());
        if (!allocations.isEmpty()) {
            metadata.put("allocations", allocations);
        }
        auditLogService.record(
                AuditModule.INGREDIENT,
                AuditAction.STOCK_ADJUST,
                "Adjusted stock for ingredient " + after.name(),
                after.id(),
                null,
                after,
                metadata
        );
        return after;
    }

    public List<StockTransaction> listTransactions(String ingredientId) {
        getEntity(ingredientId);
        return stockTransactionRepository.findByIngredientIdOrderByCreatedAtDesc(ingredientId);
    }

    public List<IngredientStockTransactionView> listTransactions(
            String ingredientId,
            StockTransactionType type,
            String q,
            Instant from,
            Instant to,
            Integer limit
    ) {
        Query query = new Query();
        query.with(Sort.by(Sort.Direction.DESC, "createdAt"));
        query.limit(normalizeLimit(limit));

        if (ingredientId != null && !ingredientId.isBlank()) {
            getEntity(ingredientId);
            query.addCriteria(Criteria.where("ingredientId").is(ingredientId));
        }
        if (type != null) {
            query.addCriteria(Criteria.where("type").is(type));
        }
        if (from != null || to != null) {
            Criteria createdAt = Criteria.where("createdAt");
            if (from != null) {
                createdAt = createdAt.gte(from);
            }
            if (to != null) {
                createdAt = createdAt.lte(to);
            }
            query.addCriteria(createdAt);
        }
        if (q != null && !q.isBlank()) {
            query.addCriteria(buildSearchCriteria(q));
        }

        List<StockTransaction> transactions = mongoTemplate.find(query, StockTransaction.class);
        Set<String> ingredientIds = transactions.stream().map(StockTransaction::getIngredientId).collect(Collectors.toSet());
        Map<String, Ingredient> ingredientById = ingredientRepository.findAllById(ingredientIds).stream()
                .collect(Collectors.toMap(Ingredient::getId, item -> item));
        Set<String> actorIds = transactions.stream()
                .map(StockTransaction::getCreatedBy)
                .filter(this::isUserIdReference)
                .collect(Collectors.toSet());
        Map<String, UserAccount> actorById = userRepository.findAllById(actorIds).stream()
                .collect(Collectors.toMap(UserAccount::getId, user -> user));

        return transactions.stream().map(tx -> {
            Ingredient ingredient = ingredientById.get(tx.getIngredientId());
            String ingredientName = resolveIngredientName(tx, ingredient);
            return new IngredientStockTransactionView(
                    tx.getId(),
                    tx.getIngredientId(),
                    ingredientName,
                    ingredient == null ? null : ingredient.getUnit(),
                    tx.getType(),
                    tx.getQty(),
                    tx.getInputUnit(),
                    tx.getUnitCost(),
                    tx.getNote(),
                    tx.getLotCode(),
                    tx.getRemainingQty(),
                    tx.getAllocations() == null ? List.of() : tx.getAllocations(),
                    tx.getCreatedAt(),
                    resolveActorLabel(tx.getCreatedBy(), actorById)
            );
        }).toList();
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
                    String headerLine = line.toLowerCase();
                    if (headerLine.contains("name") && headerLine.contains("unit")) {
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
                BigDecimal totalCost = null;
                if (parts.length > 3 && !parts[3].trim().isEmpty()) {
                    try {
                        totalCost = new BigDecimal(parts[3].trim());
                    } catch (NumberFormatException e) {
                        skipped++;
                        continue;
                    }
                }
                if (stock.compareTo(BigDecimal.ZERO) > 0 && (totalCost == null || totalCost.compareTo(BigDecimal.ZERO) <= 0)) {
                    skipped++;
                    continue;
                }
                BigDecimal reorder = parts.length > 4 && !parts[4].trim().isEmpty() ? new BigDecimal(parts[4].trim()) : BigDecimal.ZERO;

                Ingredient ingredient = new Ingredient();
                ingredient.setName(name);
                ingredient.setIngredientCode(generateUniqueIngredientCode(name));
                ingredient.setUnit(unit);
                ingredient.setCurrentStock(BigDecimal.ZERO);
                ingredient.setReorderLevel(reorder);
                ingredient.setCostTrackingMethod("AVG_BIN");
                Instant now = Instant.now();
                ingredient.setCreatedAt(now);
                ingredient.setUpdatedAt(now);
                Ingredient saved = ingredientRepository.save(ingredient);
                imported++;

                if (stock.compareTo(BigDecimal.ZERO) > 0) {
                    inventoryMutationService.addIngredient(saved.getId(), stock);
                    recordStockTransaction(
                            saved.getId(),
                            saved.getName(),
                            StockTransactionType.IN,
                            stock,
                            saved.getUnit(),
                            toBaseUnitCostFromTotal(stock, totalCost),
                            "CSV initial stock",
                            currentUser(),
                            List.of()
                    );
                }
            }
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Failed to parse CSV file");
        }

        CsvImportResult result = new CsvImportResult(imported, skipped);
        auditLogService.record(
                AuditModule.INGREDIENT,
                AuditAction.IMPORT,
                "Imported ingredients via CSV",
                null,
                null,
                result,
                java.util.Map.of("imported", imported, "skipped", skipped)
        );
        return result;
    }

    public Ingredient getEntity(String id) {
        return ingredientRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Ingredient not found"));
    }

    public void recordStockTransaction(
            String ingredientId,
            String ingredientName,
            StockTransactionType type,
            BigDecimal qty,
            String inputUnit,
            BigDecimal unitCost,
            String note,
            String createdBy,
            List<StockLotAllocation> allocations
    ) {
        StockTransaction tx = new StockTransaction();
        tx.setIngredientId(ingredientId);
        tx.setIngredientName(ingredientName);
        tx.setType(type);
        tx.setQty(qty);
        tx.setInputUnit(inputUnit);
        tx.setUnitCost(unitCost);
        tx.setNote(note);
        if (type == StockTransactionType.IN) {
            tx.setLotCode(nextLotCode(ingredientId));
            tx.setRemainingQty(qty);
            tx.setAllocations(List.of());
        } else {
            tx.setRemainingQty(null);
            tx.setAllocations(allocations == null ? List.of() : allocations);
        }
        tx.setCreatedAt(Instant.now());
        tx.setCreatedBy(createdBy);
        stockTransactionRepository.save(tx);
    }

    public List<StockLotAllocation> consumeLots(String ingredientId, BigDecimal qty) {
        BigDecimal remaining = qty;
        List<StockLotAllocation> allocations = new ArrayList<>();
        List<StockTransaction> inboundLots = stockTransactionRepository.findByIngredientIdAndTypeOrderByCreatedAtAsc(ingredientId, StockTransactionType.IN);

        for (StockTransaction lot : inboundLots) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) {
                break;
            }

            BigDecimal available = lot.getRemainingQty() == null ? safeQty(lot.getQty()) : safeQty(lot.getRemainingQty());
            if (available.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }

            BigDecimal deducted = available.min(remaining);
            BigDecimal newRemaining = available.subtract(deducted);
            lot.setRemainingQty(newRemaining);
            if (lot.getLotCode() == null || lot.getLotCode().isBlank()) {
                lot.setLotCode(legacyLotCode(lot.getId()));
            }
            stockTransactionRepository.save(lot);

            allocations.add(new StockLotAllocation(lot.getLotCode(), deducted, lot.getUnitCost()));
            remaining = remaining.subtract(deducted);
        }

        if (remaining.compareTo(BigDecimal.ZERO) > 0) {
            allocations.add(new StockLotAllocation("LEGACY-STOCK", remaining, null));
        }

        return allocations;
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
                ingredient.getIngredientCode(),
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

    private BigDecimal toBaseQty(String baseUnit, String inputUnit, BigDecimal qty) {
        if (qty == null) {
            return BigDecimal.ZERO;
        }
        String normalizedBase = baseUnit == null ? "" : baseUnit.trim().toLowerCase();
        String normalizedInput = inputUnit == null ? normalizedBase : inputUnit.trim().toLowerCase();
        if ("g".equals(normalizedBase) && "kg".equals(normalizedInput)) {
            return qty.multiply(UNIT_SCALE);
        }
        if ("ml".equals(normalizedBase) && "l".equals(normalizedInput)) {
            return qty.multiply(UNIT_SCALE);
        }
        return qty;
    }

    private BigDecimal toBaseUnitCostFromTotal(BigDecimal qtyBase, BigDecimal totalCost) {
        if (totalCost == null) {
            return null;
        }
        if (qtyBase == null || qtyBase.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Qty must be greater than 0");
        }
        return totalCost.divide(qtyBase, 12, java.math.RoundingMode.HALF_UP);
    }

    private void ensureIngredientCode(Ingredient ingredient) {
        if (ingredient.getIngredientCode() != null && !ingredient.getIngredientCode().isBlank()) {
            return;
        }
        ingredient.setIngredientCode(generateUniqueIngredientCode(ingredient.getName()));
        ingredient.setUpdatedAt(Instant.now());
        ingredientRepository.save(ingredient);
    }

    private String resolveIngredientCodeForCreate(String requestedCode, String ingredientName) {
        String normalized = normalizeIngredientCode(requestedCode);
        if (!normalized.isBlank()) {
            ingredientRepository.findByIngredientCodeIgnoreCase(normalized).ifPresent(existing -> {
                throw new ApiException(HttpStatus.CONFLICT, "Ingredient code already exists");
            });
            return normalized;
        }
        return generateUniqueIngredientCode(ingredientName);
    }

    private String normalizeIngredientCode(String code) {
        if (code == null) {
            return "";
        }
        String normalized = code.trim().toUpperCase(Locale.ROOT);
        if (normalized.isBlank() || "0".equals(normalized) || "0.0".equals(normalized) || "0,0".equals(normalized)) {
            return "";
        }
        return normalized;
    }

    private String generateUniqueIngredientCode(String ingredientName) {
        String prefix = buildIngredientCodePrefix(ingredientName);
        int initialSequence = nextIngredientSequenceForPrefix(prefix);
        for (int attempt = 0; attempt < INGREDIENT_CODE_MAX_RETRIES; attempt++) {
            String candidate = formatIngredientCode(prefix, initialSequence + attempt);
            if (ingredientRepository.findByIngredientCodeIgnoreCase(candidate).isEmpty()) {
                return candidate;
            }
        }
        throw new ApiException(HttpStatus.CONFLICT, "Unable to generate unique ingredient code");
    }

    private String buildIngredientCodePrefix(String ingredientName) {
        String normalized = Normalizer.normalize(ingredientName == null ? "" : ingredientName, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replace("Đ", "D")
                .replace("đ", "d")
                .toUpperCase(Locale.ROOT);

        List<String> words = java.util.Arrays.stream(normalized.split("[^A-Z0-9]+"))
                .filter(part -> !part.isBlank())
                .toList();

        if (words.isEmpty()) {
            return INGREDIENT_CODE_FALLBACK_PREFIX;
        }

        String initials = words.stream()
                .filter(word -> !word.isBlank())
                .map(word -> word.substring(0, 1))
                .reduce("", String::concat);
        String remainder = words.stream()
                .map(word -> word.length() > 1 ? word.substring(1) : "")
                .reduce("", String::concat);

        String candidate = (initials + remainder).replaceAll("[^A-Z0-9]", "");
        if (candidate.isBlank()) {
            candidate = words.stream().reduce("", String::concat);
        }
        if (candidate.length() < INGREDIENT_CODE_PREFIX_LENGTH) {
            candidate = candidate + INGREDIENT_CODE_FALLBACK_PREFIX;
        }
        return candidate.substring(0, INGREDIENT_CODE_PREFIX_LENGTH);
    }

    private int nextIngredientSequenceForPrefix(String prefix) {
        String codePrefix = prefix + "-";
        return ingredientRepository.findByIngredientCodeStartingWith(codePrefix).stream()
                .map(Ingredient::getIngredientCode)
                .mapToInt(code -> extractIngredientSequence(code, codePrefix))
                .max()
                .orElse(0) + 1;
    }

    private int extractIngredientSequence(String ingredientCode, String codePrefix) {
        if (ingredientCode == null || !ingredientCode.startsWith(codePrefix)) {
            return 0;
        }
        String suffix = ingredientCode.substring(codePrefix.length());
        if (!suffix.matches("\\d{" + INGREDIENT_CODE_SEQUENCE_DIGITS + "}")) {
            return 0;
        }
        return Integer.parseInt(suffix);
    }

    private String formatIngredientCode(String prefix, int sequence) {
        return prefix + "-" + String.format("%0" + INGREDIENT_CODE_SEQUENCE_DIGITS + "d", sequence);
    }

    private String resolveInputUnit(String baseUnit, String inputUnit) {
        String normalizedBase = baseUnit == null ? "" : baseUnit.trim().toLowerCase();
        String normalizedInput = (inputUnit == null || inputUnit.isBlank())
                ? normalizedBase
                : inputUnit.trim().toLowerCase();

        if ("g".equals(normalizedBase) && ("g".equals(normalizedInput) || "kg".equals(normalizedInput))) {
            return normalizedInput;
        }
        if ("ml".equals(normalizedBase) && ("ml".equals(normalizedInput) || "l".equals(normalizedInput))) {
            return normalizedInput;
        }
        if ("pcs".equals(normalizedBase) && "pcs".equals(normalizedInput)) {
            return normalizedInput;
        }
        throw new ApiException(HttpStatus.BAD_REQUEST, "Input unit is not compatible with ingredient unit " + normalizedBase);
    }

    private Criteria buildSearchCriteria(String queryText) {
        String pattern = ".*" + Pattern.quote(queryText.trim()) + ".*";
        List<String> matchingIngredientIds = mongoTemplate.find(
                Query.query(Criteria.where("name").regex(pattern, "i")),
                Ingredient.class
        ).stream().map(Ingredient::getId).toList();

        List<Criteria> conditions = new ArrayList<>();
        conditions.add(Criteria.where("note").regex(pattern, "i"));
        conditions.add(Criteria.where("lotCode").regex(pattern, "i"));
        if (!matchingIngredientIds.isEmpty()) {
            conditions.add(Criteria.where("ingredientId").in(matchingIngredientIds));
        }
        return new Criteria().orOperator(conditions.toArray(new Criteria[0]));
    }

    private int normalizeLimit(Integer limit) {
        if (limit == null || limit <= 0) {
            return DEFAULT_TX_LIMIT;
        }
        return Math.min(limit, MAX_TX_LIMIT);
    }

    private BigDecimal safeQty(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private String resolveIngredientName(StockTransaction tx, Ingredient ingredient) {
        if (tx.getIngredientName() != null && !tx.getIngredientName().isBlank()) {
            return tx.getIngredientName();
        }
        if (ingredient != null && ingredient.getName() != null && !ingredient.getName().isBlank()) {
            return ingredient.getName();
        }
        return "Deleted ingredient";
    }

    private boolean isUserIdReference(String createdBy) {
        if (createdBy == null || createdBy.isBlank()) {
            return false;
        }
        if ("system".equalsIgnoreCase(createdBy)) {
            return false;
        }
        return !createdBy.contains("@");
    }

    private String resolveActorLabel(String createdBy, Map<String, UserAccount> actorById) {
        if (createdBy == null || createdBy.isBlank()) {
            return "system";
        }
        if ("system".equalsIgnoreCase(createdBy)) {
            return "system";
        }
        if (createdBy.contains("@")) {
            return createdBy;
        }
        UserAccount actor = actorById.get(createdBy);
        if (actor == null) {
            return "Deleted user";
        }
        return actor.getEmail() == null || actor.getEmail().isBlank() ? createdBy : actor.getEmail();
    }

    private String nextLotCode(String ingredientId) {
        String shortIngredientId = ingredientId == null ? "UNK" : ingredientId.replace("-", "").toUpperCase();
        if (shortIngredientId.length() > 6) {
            shortIngredientId = shortIngredientId.substring(0, 6);
        }
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase();
        return "LOT-" + shortIngredientId + "-" + suffix;
    }

    private String legacyLotCode(String txId) {
        if (txId == null || txId.isBlank()) {
            return "LEGACY-LOT";
        }
        String suffix = txId.length() > 8 ? txId.substring(txId.length() - 8) : txId;
        return "LEGACY-" + suffix.toUpperCase();
    }
}
