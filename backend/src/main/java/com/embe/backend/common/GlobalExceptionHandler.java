package com.embe.backend.common;

import com.mongodb.MongoCommandException;
import com.mongodb.MongoException;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.mongodb.TransientClientSessionException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.time.Instant;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiError> handleApiException(ApiException exception, HttpServletRequest request) {
        return ResponseEntity.status(exception.getStatus()).body(
                new ApiError(
                        exception.getMessage(),
                        exception.getStatus().value(),
                        Instant.now(),
                        request.getRequestURI(),
                        exception.getDetails()
                )
        );
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        String message = exception.getBindingResult().getFieldErrors().stream()
                .map(FieldError::getDefaultMessage)
                .collect(Collectors.joining("; "));
        return ResponseEntity.badRequest().body(
                new ApiError(message, HttpStatus.BAD_REQUEST.value(), Instant.now(), request.getRequestURI(), null)
        );
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiError> handleAccessDenied(AccessDeniedException exception, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(
                new ApiError("Access denied", HttpStatus.FORBIDDEN.value(), Instant.now(), request.getRequestURI(), null)
        );
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiError> handleMaxUploadSize(MaxUploadSizeExceededException exception, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(
                new ApiError(
                        "Image is too large. Maximum upload size is 25MB.",
                        HttpStatus.PAYLOAD_TOO_LARGE.value(),
                        Instant.now(),
                        request.getRequestURI(),
                        null
                )
        );
    }

    @ExceptionHandler({TransientClientSessionException.class, DataAccessException.class})
    public ResponseEntity<ApiError> handleRetryableMongoConflict(Exception exception, HttpServletRequest request) {
        if (!isRetryableMongoConflict(exception)) {
            log.error("Unhandled data access error", exception);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(
                    new ApiError("Internal server error", HttpStatus.INTERNAL_SERVER_ERROR.value(), Instant.now(), request.getRequestURI(), null)
            );
        }
        return ResponseEntity.status(HttpStatus.CONFLICT).body(
                new ApiError(
                        "Temporary concurrency conflict. Please retry.",
                        HttpStatus.CONFLICT.value(),
                        Instant.now(),
                        request.getRequestURI(),
                        java.util.Map.of("code", "RETRYABLE_WRITE_CONFLICT")
                )
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleException(Exception exception, HttpServletRequest request) {
        log.error("Unhandled error", exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(
                new ApiError("Internal server error", HttpStatus.INTERNAL_SERVER_ERROR.value(), Instant.now(), request.getRequestURI(), null)
        );
    }

    private boolean isRetryableMongoConflict(Throwable throwable) {
        Throwable current = throwable;
        while (current != null) {
            if (current instanceof MongoCommandException commandException) {
                int code = commandException.getErrorCode();
                if (code == 112 || code == 251) {
                    return true;
                }
            }
            if (current instanceof MongoException mongoException) {
                int code = mongoException.getCode();
                if (code == 112 || code == 251) {
                    return true;
                }
                if (mongoException.hasErrorLabel("TransientTransactionError")) {
                    return true;
                }
            }
            String message = current.getMessage();
            if (message != null) {
                String normalized = message.toLowerCase();
                if (normalized.contains("write conflict") || normalized.contains("nosuchtransaction")) {
                    return true;
                }
            }
            current = current.getCause();
        }
        return false;
    }
}
