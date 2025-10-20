# Shipping Logistics Tool Usage Examples

This document provides comprehensive examples for all shipping logistics tools, including request/response patterns, error scenarios, caching behavior, and rate limiting.

## Table of Contents

1. [Read-Only Tools](#read-only-tools)
   - [getCarrierStatus](#getcarrierstatus)
   - [getPackageContents](#getpackagecontents)
   - [getCustomerTier](#getcustomertier)
   - [getSLA](#getsla)
   - [getExpediteQuote](#getexpeditequote)
   - [listOrders](#listorders)
2. [Write Operation Tools](#write-operation-tools)
   - [expediteShipment](#expediteshipment)
   - [holdForPickup](#holdforpickup)
   - [escalateToManager](#escalatetomanager)
   - [noActionRequired](#noactionrequired)
3. [Error Scenarios](#error-scenarios)
4. [Caching Behavior](#caching-behavior)
5. [Rate Limiting](#rate-limiting)

---

## Read-Only Tools

### getCarrierStatus

**Purpose**: Retrieve current carrier status and exception notes for an order.

#### Basic Request/Response

**Request:**
```json
{
  "order_id": "B456"
}
```

**Response:**
```json
{
  "order_id": "B456",
  "carrier": {
    "name": "RegionalExpress",
    "tracking_number": "RX8829912847",
    "status": "delivery_exception",
    "exception_note": "Box felt warm to touch. Customer not home. Returned to depot.",
    "last_update": "2025-09-30T11:15:00Z",
    "attempts_remaining": 1
  },
  "meta": {
    "etag": "\"1696089600-1234\"",
    "last_modified": "2025-09-30T11:15:00Z",
    "from_cache": false,
    "rate_limit": {
      "limit": 100,
      "remaining": 95,
      "reset_seconds": 42
    },
    "next_steps": "Carrier status retrieved successfully. Check exception_note for delivery issues."
  }
}
```

#### Conditional Request with ETag

**Request:**
```json
{
  "order_id": "B456",
  "meta": {
    "if_none_match": "\"1696089600-1234\"",
    "cache_control": "max-age=300"
  }
}
```

**Response (304 Not Modified):**
```json
{
  "status": 304,
  "meta": {
    "etag": "\"1696089600-1234\"",
    "last_modified": "2025-09-30T11:15:00Z",
    "from_cache": true,
    "rate_limit": {
      "limit": 100,
      "remaining": 94,
      "reset_seconds": 41
    },
    "next_steps": "Content unchanged since last request"
  }
}
```

---

### getPackageContents

**Purpose**: Get contents and hazard classification for a package.

#### Basic Request/Response

**Request:**
```json
{
  "order_id": "B456"
}
```

**Response:**
```json
{
  "order_id": "B456",
  "contents": [
    {
      "item": "Organic frozen berries",
      "quantity": 2,
      "weight": {
        "value": 1200,
        "unit": "grams"
      },
      "value": {
        "amount": 24.99,
        "currency": "USD"
      },
      "classification": {
        "hazmat": false,
        "perishable": true,
        "temperature_controlled": true,
        "fragile": false
      }
    }
  ],
  "total_weight": {
    "value": 1200,
    "unit": "grams"
  },
  "total_value": {
    "amount": 24.99,
    "currency": "USD"
  },
  "meta": {
    "etag": "\"1696089601-5678\"",
    "last_modified": "2025-09-30T11:15:01Z",
    "from_cache": false,
    "rate_limit": {
      "limit": 100,
      "remaining": 94,
      "reset_seconds": 41
    },
    "next_steps": "Package contents retrieved. Check classification for hazmat/perishable status."
  }
}
```

---

### getCustomerTier

**Purpose**: Get customer tier and account standing information.

#### Basic Request/Response

**Request:**
```json
{
  "order_id": "B456"
}
```

**Response:**
```json
{
  "order_id": "B456",
  "customer": {
    "tier": "vip",
    "account_value": {
      "amount": 15750.00,
      "currency": "USD"
    },
    "satisfaction_score": 4.8,
    "orders_this_year": 47,
    "member_since": "2019-03-15T00:00:00Z"
  },
  "meta": {
    "etag": "\"1696089602-9012\"",
    "last_modified": "2025-09-30T11:15:02Z",
    "from_cache": false,
    "rate_limit": {
      "limit": 100,
      "remaining": 93,
      "reset_seconds": 40
    },
    "next_steps": "Customer tier retrieved. VIP customers receive priority handling."
  }
}
```

---

### getSLA

**Purpose**: Get SLA deadline and penalty information for an order.

#### Basic Request/Response

**Request:**
```json
{
  "order_id": "B456"
}
```

**Response:**
```json
{
  "order_id": "B456",
  "sla": {
    "tier": "premium",
    "promised_delivery": "2025-10-01T17:00:00Z",
    "current_status": "at_risk",
    "hours_remaining": 6.75,
    "penalty": {
      "amount": 50.00,
      "currency": "USD",
      "type": "refund"
    }
  },
  "meta": {
    "etag": "\"1696089603-3456\"",
    "last_modified": "2025-09-30T11:15:03Z",
    "from_cache": false,
    "rate_limit": {
      "limit": 100,
      "remaining": 92,
      "reset_seconds": 39
    },
    "next_steps": "SLA information retrieved. Status 'at_risk' indicates potential deadline miss."
  }
}
```

---

### getExpediteQuote

**Purpose**: Get cost and ETA for expedited shipping options.

#### Basic Request/Response

**Request:**
```json
{
  "order_id": "B456",
  "speed": "overnight"
}
```

**Response:**
```json
{
  "order_id": "B456",
  "quote": {
    "speed": "overnight",
    "carrier": "PriorityAir",
    "cost": {
      "amount": 45.99,
      "currency": "USD"
    },
    "eta": "2025-10-01T09:00:00Z",
    "temperature_controlled": true,
    "tracking_available": true
  },
  "meta": {
    "etag": "\"1696089604-7890\"",
    "last_modified": "2025-09-30T11:15:04Z",
    "from_cache": false,
    "rate_limit": {
      "limit": 100,
      "remaining": 91,
      "reset_seconds": 38
    },
    "next_steps": "Expedite quote retrieved. Use expediteShipment to execute this option."
  }
}
```

---

### listOrders

**Purpose**: List orders with delivery exceptions or specific status filters for overview and pattern identification.

#### Basic Request/Response

**Request:**
```json
{
  "filters": {
    "status": "delivery_exception",
    "customer_tier": "vip"
  }
}
```

**Response:**
```json
{
  "orders": [
    {
      "order_id": "B456",
      "status": "delivery_exception",
      "customer_tier": "vip",
      "has_hazmat": false,
      "is_perishable": true,
      "sla_at_risk": true,
      "exception_note": "Box felt warm to touch. Customer not home. Returned to depot.",
      "created_date": "2025-09-30",
      "carrier": "RegionalExpress"
    }
  ],
  "total_count": 1,
  "filters_applied": {
    "status": "delivery_exception",
    "customer_tier": "vip"
  },
  "meta": {
    "etag": "\"1696089609-5555\"",
    "last_modified": "2025-09-30T11:15:09Z",
    "from_cache": false,
    "rate_limit": {
      "limit": 100,
      "remaining": 86,
      "reset_seconds": 33
    },
    "paging": {
      "next_cursor": null,
      "has_more": false
    },
    "next_steps": "Found 1 orders matching criteria. All results returned."
  }
}
```

#### Paginated Request/Response

**Request:**
```json
{
  "filters": {
    "status": "delivery_exception"
  },
  "meta": {
    "paging": {
      "limit": 2
    }
  }
}
```

**Response:**
```json
{
  "orders": [
    {
      "order_id": "B456",
      "status": "delivery_exception",
      "customer_tier": "vip",
      "has_hazmat": false,
      "is_perishable": true,
      "sla_at_risk": true,
      "exception_note": "Box felt warm to touch. Customer not home. Returned to depot.",
      "created_date": "2025-09-30",
      "carrier": "RegionalExpress"
    },
    {
      "order_id": "A123",
      "status": "delivery_exception",
      "customer_tier": "standard",
      "has_hazmat": true,
      "is_perishable": false,
      "sla_at_risk": false,
      "exception_note": "Hazmat package - requires special handling",
      "created_date": "2025-09-30",
      "carrier": "SafetyFirst"
    }
  ],
  "total_count": 3,
  "filters_applied": {
    "status": "delivery_exception"
  },
  "meta": {
    "etag": "\"1696089610-6666\"",
    "last_modified": "2025-09-30T11:15:10Z",
    "from_cache": false,
    "rate_limit": {
      "limit": 100,
      "remaining": 85,
      "reset_seconds": 32
    },
    "paging": {
      "next_cursor": "eyJvZmZzZXQiOjJ9",
      "has_more": true
    },
    "next_steps": "Found 3 orders matching criteria. Use next_cursor for additional results."
  }
}
```

#### Next Page Request

**Request:**
```json
{
  "filters": {
    "status": "delivery_exception"
  },
  "meta": {
    "paging": {
      "cursor": "eyJvZmZzZXQiOjJ9",
      "limit": 2
    }
  }
}
```

**Response:**
```json
{
  "orders": [
    {
      "order_id": "F111",
      "status": "delivery_exception",
      "customer_tier": "standard",
      "has_hazmat": false,
      "is_perishable": false,
      "sla_at_risk": false,
      "exception_note": "Address not found - customer contacted",
      "created_date": "2025-09-30",
      "carrier": "StandardShip"
    }
  ],
  "total_count": 3,
  "filters_applied": {
    "status": "delivery_exception"
  },
  "meta": {
    "etag": "\"1696089611-7777\"",
    "last_modified": "2025-09-30T11:15:11Z",
    "from_cache": false,
    "rate_limit": {
      "limit": 100,
      "remaining": 84,
      "reset_seconds": 31
    },
    "paging": {
      "next_cursor": null,
      "has_more": false
    },
    "next_steps": "Found 3 orders matching criteria. All results returned."
  }
}
```

---

## Write Operation Tools

### expediteShipment

**Purpose**: Execute expedited shipping for an order when perishable goods need faster delivery or SLA is at risk.

#### Basic Request/Response

**Request:**
```json
{
  "order_id": "B456",
  "speed": "overnight",
  "reason": "Perishable goods at risk due to temperature control failure",
  "meta": {
    "idempotency_key": "exp_b456_001",
    "request_id": "req_123456"
  }
}
```

**Response:**
```json
{
  "success": true,
  "action_id": "EXP_1696089605000_abc123",
  "order_id": "B456",
  "shipping_details": {
    "new_tracking_number": "PA-OVN-PriorityAir-12345678",
    "new_carrier": "PriorityAir",
    "new_eta": "2025-10-01T09:00:00Z",
    "cost": {
      "amount": 45.99,
      "currency": "USD"
    },
    "temperature_controlled": true
  },
  "confirmation": "Expedited overnight shipping confirmed for order B456",
  "next_steps": [
    "Package will be picked up within 1 hour",
    "Customer will receive tracking update via SMS/email",
    "Temperature monitoring enabled for perishable contents"
  ],
  "meta": {
    "etag": "\"1696089605-1111\"",
    "last_modified": "2025-09-30T11:15:05Z",
    "from_cache": false,
    "rate_limit": {
      "limit": 100,
      "remaining": 90,
      "reset_seconds": 37
    },
    "next_steps": "Expedited shipping successfully arranged"
  }
}
```

---

### holdForPickup

**Purpose**: Hold order at carrier facility for customer pickup when delivery is not possible.

#### Basic Request/Response

**Request:**
```json
{
  "order_id": "H789",
  "reason": "Package contains hazardous materials - cannot be delivered to residence",
  "meta": {
    "idempotency_key": "hold_h789_001",
    "request_id": "req_789012"
  }
}
```

**Response:**
```json
{
  "success": true,
  "action_id": "HOLD_1696089606000_def456",
  "order_id": "H789",
  "pickup_details": {
    "facility_name": "RegionalExpress Distribution Center",
    "facility_address": "1234 Logistics Way, Industrial Park, ST 12345",
    "pickup_hours": "Monday-Friday 8:00 AM - 6:00 PM, Saturday 9:00 AM - 2:00 PM",
    "hold_until": "2025-10-15T17:00:00Z",
    "required_id": true,
    "pickup_code": "HOLD-H789-2025"
  },
  "confirmation": "Order H789 held for pickup due to hazardous materials",
  "next_steps": [
    "Customer will be notified via phone and email",
    "Pickup instructions sent with facility details",
    "Package will be held for 14 days maximum"
  ],
  "meta": {
    "etag": "\"1696089606-2222\"",
    "last_modified": "2025-09-30T11:15:06Z",
    "from_cache": false,
    "rate_limit": {
      "limit": 100,
      "remaining": 89,
      "reset_seconds": 36
    },
    "next_steps": "Package successfully held for pickup"
  }
}
```

---

### escalateToManager

**Purpose**: Escalate decision to human manager when situation is ambiguous or high-risk.

#### Basic Request/Response

**Request:**
```json
{
  "order_id": "C999",
  "reason": "Complex situation involving both hazmat and perishable goods with conflicting safety requirements",
  "urgency": "high",
  "meta": {
    "idempotency_key": "esc_c999_001",
    "request_id": "req_345678"
  }
}
```

**Response:**
```json
{
  "success": true,
  "escalation_id": "ESC_1696089607000_ghi789",
  "order_id": "C999",
  "assignment": {
    "manager_name": "Sarah Johnson",
    "manager_id": "MGR_001",
    "expected_response": "2025-09-30T13:00:00Z",
    "urgency_level": "high",
    "case_number": "CASE-2025-09-30-001"
  },
  "confirmation": "Order C999 escalated to manager for complex safety decision",
  "next_steps": [
    "Manager Sarah Johnson will review within 2 hours",
    "All relevant data has been compiled for review",
    "Customer will be notified of review process",
    "Temporary hold placed on order pending decision"
  ],
  "meta": {
    "etag": "\"1696089607-3333\"",
    "last_modified": "2025-09-30T11:15:07Z",
    "from_cache": false,
    "rate_limit": {
      "limit": 100,
      "remaining": 88,
      "reset_seconds": 35
    },
    "next_steps": "Escalation successfully created"
  }
}
```

---

### noActionRequired

**Purpose**: Document that no intervention is needed and standard delivery process should continue.

#### Basic Request/Response

**Request:**
```json
{
  "order_id": "A123",
  "reason": "Standard delivery process is sufficient - no safety, compliance, or SLA concerns identified",
  "meta": {
    "idempotency_key": "no_action_a123_001",
    "request_id": "req_901234"
  }
}
```

**Response:**
```json
{
  "success": true,
  "action_id": "NOACTION_1696089608000_jkl012",
  "order_id": "A123",
  "decision": {
    "outcome": "continue_standard_process",
    "reasoning": "Standard delivery process is sufficient - no safety, compliance, or SLA concerns identified",
    "reviewed_factors": [
      "Package contents: non-hazardous, non-perishable",
      "Customer tier: standard",
      "SLA status: on-track",
      "Delivery attempts: within normal range"
    ]
  },
  "confirmation": "No action required for order A123 - standard process continues",
  "next_steps": [
    "Order continues through normal delivery workflow",
    "Next delivery attempt scheduled as per carrier schedule",
    "Customer tracking information remains current"
  ],
  "meta": {
    "etag": "\"1696089608-4444\"",
    "last_modified": "2025-09-30T11:15:08Z",
    "from_cache": false,
    "rate_limit": {
      "limit": 100,
      "remaining": 87,
      "reset_seconds": 34
    },
    "next_steps": "Decision documented successfully"
  }
}
```

---

## Error Scenarios

### Validation Errors (400)

#### Invalid Order ID Format

**Request:**
```json
{
  "order_id": "invalid123"
}
```

**Response:**
```json
{
  "type": "/errors/validation",
  "title": "Request Validation Failed",
  "status": 400,
  "detail": "order_id must match pattern ^[A-Z][0-9]{3,6}$ (one letter followed by 3-6 digits)",
  "instance": "/shipping/get_carrier_status/1696089609123",
  "next_steps": "Provide order_id in format: one letter + 3-6 digits (e.g., B456, A1234, Z123456)"
}
```

#### Missing Required Field

**Request:**
```json
{
  "speed": "overnight",
  "reason": "Urgent delivery needed"
}
```

**Response:**
```json
{
  "type": "/errors/validation",
  "title": "Request Validation Failed",
  "status": 400,
  "detail": "Missing required field: order_id",
  "instance": "/shipping/expedite_shipment/1696089610456",
  "next_steps": "Include order_id field with format: one letter + 3-6 digits (e.g., B456)"
}
```

#### Invalid Enum Value

**Request:**
```json
{
  "order_id": "B456",
  "speed": "super_fast"
}
```

**Response:**
```json
{
  "type": "/errors/validation",
  "title": "Request Validation Failed",
  "status": 400,
  "detail": "speed must be one of: overnight, same_day",
  "instance": "/shipping/get_expedite_quote/1696089611789",
  "next_steps": "Use 'overnight' for next business day delivery or 'same_day' for same-day delivery"
}
```

### Rate Limit Errors (429)

**Request:**
```json
{
  "order_id": "B456"
}
```

**Response:**
```json
{
  "type": "/errors/rate_limit",
  "title": "Rate Limit Exceeded",
  "status": 429,
  "detail": "Exceeded 100 requests per minute limit. Current usage: 101 requests",
  "instance": "/shipping/get_carrier_status/1696089612012",
  "next_steps": "Wait 48 seconds before retrying. Consider implementing exponential backoff for automated systems."
}
```

### Not Found Errors (404)

**Request:**
```json
{
  "order_id": "Z999999"
}
```

**Response:**
```json
{
  "type": "/errors/not_found",
  "title": "Order Not Found",
  "status": 404,
  "detail": "Order Z999999 does not exist in the system",
  "instance": "/shipping/get_carrier_status/1696089613345",
  "next_steps": "Verify the order ID is correct and that the order exists in the system. Check for typos in the order number."
}
```

### Conflict Errors (409)

**Request:**
```json
{
  "order_id": "B456",
  "speed": "overnight",
  "reason": "Urgent delivery needed",
  "meta": {
    "idempotency_key": "exp_b456_001",
    "request_id": "req_duplicate"
  }
}
```

**Response:**
```json
{
  "type": "/errors/conflict",
  "title": "Idempotency Key Conflict",
  "status": 409,
  "detail": "Idempotency key 'exp_b456_001' has already been used for a different operation",
  "instance": "/shipping/expedite_shipment/1696089614678",
  "next_steps": "Use a unique idempotency_key for each operation. Format: action_orderid_timestamp (e.g., exp_b456_002)"
}
```

---

## Caching Behavior

### Cache Hit Example

When Momento cache is enabled and data is cached:

**Request:**
```json
{
  "order_id": "B456"
}
```

**Response (from cache):**
```json
{
  "order_id": "B456",
  "carrier": {
    "name": "RegionalExpress",
    "tracking_number": "RX8829912847",
    "status": "delivery_exception",
    "exception_note": "Box felt warm to touch. Customer not home. Returned to depot.",
    "last_update": "2025-09-30T11:15:00Z",
    "attempts_remaining": 1
  },
  "meta": {
    "etag": "\"1696089600-1234\"",
    "last_modified": "2025-09-30T11:15:00Z",
    "from_cache": true,
    "rate_limit": {
      "limit": 100,
      "remaining": 95,
      "reset_seconds": 42
    },
    "next_steps": "Data retrieved from cache for faster response"
  }
}
```

### Cache Miss Example

When data is not in cache or cache is disabled:

**Response (fresh data):**
```json
{
  "meta": {
    "from_cache": false,
    "next_steps": "Fresh data retrieved from primary storage"
  }
}
```

### ETag Usage

ETags enable efficient conditional requests:

1. **First Request**: Client receives ETag in response
2. **Subsequent Request**: Client sends `if_none_match` with ETag
3. **304 Response**: If data unchanged, server returns 304 with no body
4. **200 Response**: If data changed, server returns new data with new ETag

---

## Rate Limiting

### Rate Limit Information

All responses include rate limit information in the meta object:

```json
{
  "meta": {
    "rate_limit": {
      "limit": 100,
      "remaining": 87,
      "reset_seconds": 34
    }
  }
}
```

- **limit**: Maximum requests per minute (100 RPM)
- **remaining**: Requests remaining in current window
- **reset_seconds**: Seconds until rate limit window resets

### Rate Limit Exceeded

When rate limit is exceeded:

```json
{
  "type": "/errors/rate_limit",
  "title": "Rate Limit Exceeded",
  "status": 429,
  "detail": "Exceeded 100 requests per minute limit",
  "next_steps": "Wait 34 seconds before retrying"
}
```

### Retry Strategies

#### Exponential Backoff

```javascript
async function retryWithBackoff(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (error.status === 429 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 // 2s, 4s, 8s
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw error
    }
  }
}
```

#### Rate Limit Aware Retry

```javascript
async function retryWithRateLimit(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (error.status === 429 && attempt < maxRetries) {
        // Use the reset_seconds from the error response
        const resetSeconds = error.reset_seconds || Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, resetSeconds * 1000))
        continue
      }
      throw error
    }
  }
}
```

### Momento Fallback Behavior

When `MOMENTO_API_KEY` is not configured:

- Rate limiting is disabled
- Caching is disabled
- `rate_limit` fields are set to `null`
- `from_cache` is always `false`
- All operations continue normally without caching/rate limiting

**Response without Momento:**
```json
{
  "meta": {
    "from_cache": false,
    "rate_limit": null,
    "next_steps": "Momento not configured - operating without cache and rate limiting"
  }
}
```

**List Operations without Momento:**
```json
{
  "meta": {
    "from_cache": false,
    "rate_limit": null,
    "paging": {
      "next_cursor": null,
      "has_more": false
    },
    "next_steps": "Momento not configured - operating without cache and rate limiting"
  }
}
```
