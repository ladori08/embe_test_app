package com.embe.backend.ingredient;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/admin/ingredients")
public class IngredientController {

    private final IngredientService ingredientService;

    public IngredientController(IngredientService ingredientService) {
        this.ingredientService = ingredientService;
    }

    @GetMapping
    public List<IngredientResponse> list() {
        return ingredientService.list();
    }

    @GetMapping("/{id}")
    public IngredientResponse get(@PathVariable String id) {
        return ingredientService.get(id);
    }

    @PostMapping
    public IngredientResponse create(@Valid @RequestBody IngredientRequest request) {
        return ingredientService.create(request);
    }

    @PutMapping("/{id}")
    public IngredientResponse update(@PathVariable String id, @Valid @RequestBody IngredientRequest request) {
        return ingredientService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable String id, @RequestParam(defaultValue = "false") boolean force) {
        ingredientService.delete(id, force);
    }

    @PostMapping("/{id}/stock-adjustments")
    public IngredientResponse adjustStock(@PathVariable String id, @Valid @RequestBody StockAdjustmentRequest request) {
        return ingredientService.adjustStock(id, request);
    }

    @GetMapping("/{id}/transactions")
    public List<StockTransaction> transactions(@PathVariable String id) {
        return ingredientService.listTransactions(id);
    }

    @PostMapping(value = "/import", consumes = "multipart/form-data")
    public CsvImportResult importCsv(@RequestPart("file") MultipartFile file) {
        return ingredientService.importCsv(file);
    }
}
