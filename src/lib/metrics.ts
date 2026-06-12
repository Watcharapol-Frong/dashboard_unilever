/**
 * Metric Layer — Single source of truth for all shared SQL fragments and
 * business-logic definitions. Every API route and the mart builder must
 * import from here so that a definition change propagates everywhere at once.
 *
 * Adding a new metric: define the SQL fragment + optional description here,
 * then import wherever needed. AI assistants can also reference METRIC_DEFS
 * to explain metrics to users without hard-coding business logic.
 */

// ── Conversion Status ─────────────────────────────────────────────────────────

/** Orders placed within the attribution window after telesales contact. */
export const CONV =
  `customer_type IN ('new_customer','retention')`

/** Orders placed outside the attribution window (telesales not credited). */
export const NOT_CONV =
  `customer_type IN ('first_order_not_converted','retention_not_converted')`

// ── Call Reachability ─────────────────────────────────────────────────────────

/**
 * "Reached" = a productive call connection occurred.
 * Excludes: no-answer variants, phone-off/unreachable, not-convenient-to-talk,
 * and not-interested statuses (Thai DB values).
 *
 * Use as: `FILTER (WHERE ${REACHED})` or `WHERE ${REACHED}`
 * For table-prefixed columns use reachedCond('tc') etc.
 */
export const REACHED =
  `call_status NOT LIKE 'ไม่รับสาย%'` +
  ` AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'` +
  ` AND call_status IS DISTINCT FROM 'ไม่สะดวกคุย'` +
  ` AND call_status IS DISTINCT FROM 'ยังไม่ต้องการสินค้า'`

/**
 * Returns the REACHED condition with every column reference prefixed.
 * e.g. reachedCond('tc') → `tc.call_status NOT LIKE ...`
 */
export function reachedCond(tableAlias: string): string {
  return REACHED.replace(/call_status/g, `${tableAlias}.call_status`)
}

// ── Metric Definitions (for tooltips, Help, and AI context) ──────────────────

export const METRIC_DEFS = {
  converted: {
    en: 'Orders placed within the attribution window after telesales contact. Counted on customer_type = new_customer or retention.',
    th: 'คำสั่งซื้อที่เกิดขึ้นภายใน attribution window หลังจากติดต่อผ่าน telesales นับจาก customer_type = new_customer หรือ retention',
    sql: CONV,
  },
  not_converted: {
    en: 'Orders placed outside the attribution window — telesales contact was not credited for these sales.',
    th: 'คำสั่งซื้อที่เกิดขึ้นนอก attribution window — ไม่นับเป็นผลของ telesales',
    sql: NOT_CONV,
  },
  reached: {
    en: 'Calls where the customer picked up and a productive interaction occurred. Excludes no-answer, phone-off, not-convenient, and not-interested statuses.',
    th: 'สายที่ลูกค้ารับและมีการสนทนาที่เป็นประโยชน์ ไม่รวม: ไม่รับสาย, ปิดเครื่อง/ติดต่อไม่ได้, ไม่สะดวกคุย, ยังไม่ต้องการสินค้า',
    sql: REACHED,
  },
  new_customer: {
    en: 'A customer whose first-ever HOC order falls within the attribution window.',
    th: 'ลูกค้าที่สั่ง HOC ครั้งแรกภายใน attribution window',
    sql: `customer_type = 'new_customer'`,
  },
  retention: {
    en: 'A customer who reordered HOC products within the attribution window.',
    th: 'ลูกค้าที่สั่งซื้อ HOC ซ้ำภายใน attribution window',
    sql: `customer_type = 'retention'`,
  },
} as const
