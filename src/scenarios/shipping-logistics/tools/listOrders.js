import { createMockResponse, generateEtag, handleConditionalRequest } from '../../../utils/toolHelpers.js'
import { trackRateLimit } from '../../../utils/rateLimiting.js'

// Mock data for orders with various statuses
const mockOrders = [
  {
    order_id: 'B456',
    status: 'delivery_exception',
    customer_tier: 'vip',
    has_hazmat: false,
    is_perishable: true,
    sla_at_risk: true,
    exception_note: 'Box felt warm to touch. Customer not home. Returned to depot.',
    created_date: '2025-09-30',
    carrier: 'RegionalExpress'
  },
  {
    order_id: 'A123',
    status: 'delivery_exception',
    customer_tier: 'standard',
    has_hazmat: true,
    is_perishable: false,
    sla_at_risk: false,
    exception_note: 'Hazmat package - requires special handling',
    created_date: '2025-09-30',
    carrier: 'SafetyFirst'
  },
  {
    order_id: 'C789',
    status: 'in_transit',
    customer_tier: 'premium',
    has_hazmat: false,
    is_perishable: true,
    sla_at_risk: true,
    exception_note: null,
    created_date: '2025-09-29',
    carrier: 'FastTrack'
  },
  {
    order_id: 'D999',
    status: 'held',
r_tier: 'vip',
    has_hazmat: true,
    is_perishable: false,
    sla_at_risk: false,
    exception_note: 'Held for pickup - hazmat restrictions',
    created_date: '2025-09-29',
    carrier: 'SafetyFirst'
  },
  {
    order_id: 'E555',
    status: 'expedited',
    customer_tier: 'premium',
    has_hazmat: false,
    is_perishable: true,
    sla_at_risk: false,
    exception_note: 'Expedited due to temperature concerns',
    created_date: '2025-09-30',
    carrier: 'PriorityAir'
  },
  {
    order_id: 'F111',
    status: 'delivery_exception',
    customer_tier: 'standard',
    has_hazmat: false,
    is_perishable: false,
    sla_at_risk: false,
    exception_note: 'Address not found - customer contacted',
    created_date: '2025-09-30',
    carrier: 'StandardShip'
  },
  {
    order_id: 'G222',
    status: 'delivered',
    customer_tier: 'vip',
    has_hazmat: false,
    is_perishable: false,
    sla_at_risk: false,
    exception_note: null,
    created_date: '2025-09-29',
    carrier: 'RegionalExpress'
  }
]

function applyFilters(orders, filters) {
  if (!filters) return orders

  return orders.filter(order => {
    // Status filter
    if (filters.status && order.status !== filters.status) {
      return false
    }

    // Customer tier filter
    if (filters.customer_tier && order.customer_tier !== filters.customer_tier) {
      return false
    }

    // Hazmat filter
    if (filters.has_hazmat !== undefined && order.has_hazmat !== filters.has_hazmat) {
      return false
    }

    // Perishable filter
    if (filters.is_perishable !== undefined && order.is_perishable !== filters.is_perishable) {
      return false
    }

    // SLA at risk filter
    if (filters.sla_at_risk !== undefined && order.sla_at_risk !== filters.sla_at_risk) {
      return false
    }

    // Date range filter
    if (filters.date_range) {
      const orderDate = new Date(order.created_date)
      if (filters.date_range.start) {
        const startDate = new Date(filters.date_range.start)
        if (orderDate < startDate) return false
      }
      if (filters.date_range.end) {
        const endDate = new Date(filters.date_range.end)
        if (orderDate > endDate) return false
      }
    }

    return true
  })
}

function paginateResults(orders, paging) {
  if (!paging) {
    return {
      orders: orders.slice(0, 20), // Default limit
      next_cursor: orders.length > 20 ? btoa(JSON.stringify({ offset: 20 })) : null,
      has_more: orders.length > 20
    }
  }

  const limit = paging.limit || 20
  let offset = 0

  if (paging.cursor) {
    try {
      const cursorData = JSON.parse(atob(paging.cursor))
      offset = cursorData.offset || 0
    } catch (error) {
      // Invalid cursor, start from beginning
      offset = 0
    }
  }

  const paginatedOrders = orders.slice(offset, offset + limit)
  const hasMore = orders.length > offset + limit
  const nextCursor = hasMore ? btoa(JSON.stringify({ offset: offset + limit })) : null

  return {
    orders: paginatedOrders,
    next_cursor: nextCursor,
    has_more: hasMore
  }
}

export async function listOrders(params) {
  const { filters, meta } = params

  // Check rate limiting
  const rateLimitResult = await trackRateLimit()
  if (rateLimitResult.exceeded) {
    return {
      type: '/errors/rate_limit',
      title: 'Rate Limit Exceeded',
      status: 429,
      detail: `Exceeded 100 requests per minute limit. Current usage: ${101} requests`,
      instance: `/shipping/list_orders/${Date.now()}`,
      next_steps: `Wait ${rateLimitResult.info.reset_seconds} seconds before retrying. Consider implementing exponential backoff for automated systems.`
    }
  }

  // Apply filters to get matching orders
  const filteredOrders = applyFilters(mockOrders, filters)

  // Apply pagination
  const paginationResult = paginateResults(filteredOrders, meta?.paging)

  // Create response data
  const responseData = {
    orders: paginationResult.orders,
    total_count: filteredOrders.length,
    filters_applied: filters || {},
    meta: HandlerUtils.createResponseMeta({
      etag: generateEtag({ orders: paginationResult.orders, filters }),
      rateLimitInfo: rateLimitResult.info,
      includePaging: HandlerUtils.shouldIncludePaging('listOrders', 'list'),
      nextCursor: paginationResult.next_cursor,
      hasMore: paginationResult.has_more,
      nextSteps: `Found ${filteredOrders.length} orders matching criteria. ${paginationResult.has_more ? 'Use next_cursor for additional results.' : 'All results returned.'}`
    })
  }

  // Handle conditional requests
  if (meta?.if_none_match) {
    const conditionalResponse = handleConditionalRequest(responseData, meta.if_none_match)
    if (conditionalResponse) {
      return conditionalResponse
    }
  }

  return responseData
}
