package com.embe.backend.bake;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/bakes")
public class BakeController {

    private final BakeService bakeService;

    public BakeController(BakeService bakeService) {
        this.bakeService = bakeService;
    }

    @GetMapping
    public List<BakeResponse> list() {
        return bakeService.list();
    }

    @PostMapping
    public BakeResponse produce(@Valid @RequestBody BakeRequest request) {
        return bakeService.produce(request);
    }
}
