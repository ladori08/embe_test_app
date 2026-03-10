package com.embe.backend.user;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/users")
public class UserAdminController {

    private final UserAdminService userAdminService;

    public UserAdminController(UserAdminService userAdminService) {
        this.userAdminService = userAdminService;
    }

    @GetMapping
    public List<AdminUserResponse> list() {
        return userAdminService.list();
    }

    @PostMapping
    public AdminUserResponse create(@Valid @RequestBody AdminUserCreateRequest request) {
        return userAdminService.create(request);
    }

    @PutMapping("/{id}")
    public AdminUserResponse update(@PathVariable String id, @Valid @RequestBody AdminUserUpdateRequest request) {
        return userAdminService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable String id) {
        userAdminService.delete(id);
    }
}
