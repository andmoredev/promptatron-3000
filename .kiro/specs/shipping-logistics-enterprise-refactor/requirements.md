# Requirements Document

## Introduction

This specification outlines the requirements for refactoring all shipping-logistics tools to meet enterprise best practices and be LLM-friendly. The refactoring will standardize request/response schemas, implement proper error handling, add caching capabilities, and ensure consistent validation across all tools.

## Requirements

### Requirement 1: Enterprise-Grade Schema Standardization

**User Story:** As a developer integrating with the shipping-logistics tools, I want consistent, well-defined schemas so that I can reliably predict request/response structures and handle errors appropriately.

#### Acceptance Criteria

1. WHEN making a write operation request THEN the system SHALL require a meta object with idempotency_key and request_id fields
2. WHEN making a read operation request THEN the system SHALL accept a meta object with if_none_match, cache_control, and paging fields
3. WHEN receiving any response THEN the system SHALL include a standardized meta object with etag, last_modified, from_cache, rate_limit, paging, and next_steps fields
4. WHEN a request's if_none_match equals the current etag THEN the system SHALL return a 304 status with empty body and populated response meta
5. WHEN paging is used THEN the system SHALL provide next_cursor and has_more fields with proper cursor stability

### Requirement 2: RFC 7807 Error Handling

**User As a client application, I want standardized error responses so that I can handle errors consistently and provide actionable feedback to users.

#### Acceptance Criteria

1. WHEN an error occurs THEN the system SHALL return an RFC 7807 compliant error response
2. WHEN an error occurs THEN the system SHALL include type, title, status, detail, instance, and next_steps fields
3. WHEN validation fails THEN the system SHALL use consistent type URIs like /errors/validation
4. WHEN rate limits are exceeded THEN the system SHALL use /errors/rate_limit type URI
5. WHEN conflicts occur THEN the system SHALL use /errors/conflict type URI
6. WHEN an error occurs THEN the system SHALL provide actionable next_steps guidance

### Requirement 3: LLM-Friendly Tool Design

**User Story:** As an LLM using these tools, I want clear, unambiguous schemas with proper validation so that I can generate valid requests and understand responses effectively.

#### Acceptance Criteria

1. WHEN defining tool schemas THEN the system SHALL use precise names and descriptions that state intent and outcome
2. WHEN defining properties THEN the system SHALL include type, clear description, and realistic examples
3. WHEN applicable THEN the system SHALL use enums, patterns, min/max, and length constraints for validation
4. WHEN defining business properties THEN the system SHALL include all relevant fields for rich, valid input
5. WHEN using timestamps THEN the system SHALL use RFC3339 format strings
6. WHEN using currencies THEN the system SHALL use ISO-4217 codes
7. WHEN using measurements THEN the system SHALL specify explicit units (grams, cm, etc.)

### Requirement 4: Caching Integration

**User Story:** As a system administrator, I want efficient caching to reduce redundant operations and improve performance while maintaining data consistency.

#### Acceptance Criteria

1. WHEN implementing caching THEN the system SHALL use Momento Cache with @gomomento/sdk-web package
2. WHEN MOMENTO_API_KEY environment variable is not present THEN the system SHALL short-circuit caching and operate without cache
3. WHEN caching responses THEN the system SHALL generate appropriate etags for cache validation
4. WHEN cache hits occur THEN the system SHALL set from_cache to true in response meta
5. WHEN cache misses occur THEN the system SHALL set from_cache to false in response meta
6. WHEN cached data expires THEN the system SHALL refresh from primary storage

### Requirement 5: Consistent Validation and Patterns

**User Story:** As a developer maintaining the codebase, I want consistent validation patterns and naming conventions so that the code is predictable and maintainable.

#### Acceptance Criteria

1. WHEN naming properties THEN the system SHALL use snake_case consistently
2. WHEN defining schemas THEN the system SHALL use JSON Schema v7+ with additionalProperties: false where appropriate
3. WHEN validating carrier codes THEN the system SHALL use clear enums
4. WHEN validating statuses THEN the system SHALL use clear enums
5. WHEN validating IDs THEN the system SHALL use appropriate patterns
6. WHEN defining limits THEN the system SHALL specify explicit min/max values

### Requirement 6: Tool Handler Refactoring

**User Story:** As a system integrator, I want updated tool handlers that implement the new schemas while preserving existing business logic and functionality.

#### Acceptance Criteria

1. WHEN refactoring handlers THEN the system SHALL preserve all existing business semantics
2. WHEN implementing new schemas THEN the system SHALL maintain backward compatibility where possible
3. WHEN adding caching THEN the system SHALL not break existing functionality
4. WHEN updating responses THEN the system SHALL include all required meta fields
5. WHEN handling errors THEN the system SHALL use the new RFC 7807 format

### Requirement 7: Rate Limiting and Performance

**User Story:** As a system operator, I want proper rate limiting and performance monitoring so that I can ensure system stability and track usage patterns.

#### Acceptance Criteria

1. WHEN processing requests THEN the system SHALL implement a rate limit of 100 requests per minute (RPM)
2. WHEN implementing rate limiting THEN the system SHALL use Momento increment API call for tracking
3. WHEN processing requests THEN the system SHALL include rate_limit information in response meta with limit, remaining, and reset_seconds
4. WHEN rate limits are exceeded THEN the system SHALL return appropriate /errors/rate_limit error responses
5. WHEN MOMENTO_API_KEY is not present THEN the system SHALL skip rate limiting and set rate_limit fields to null
6. WHEN tracking performance THEN the system SHALL log response times and cache hit rates

### Requirement 8: Documentation and Examples

**User Story:** As a developer using these tools, I want comprehensive documentation and examples so that I can integrate effectively without trial and error.

#### Acceptance Criteria

1. WHEN documenting schemas THEN the system SHALL provide realistic examples for all properties
2. WHEN describing tools THEN the system SHALL clearly state the business purpose and expected outcomes
3. WHEN showing error responses THEN the system SHALL provide examples of common error scenarios
4. WHEN explaining caching THEN the system SHALL document cache behavior and etag usage
5. WHEN providing examples THEN the system SHALL show complete request/response cycles
