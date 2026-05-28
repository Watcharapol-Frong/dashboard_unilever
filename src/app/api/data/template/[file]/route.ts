import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'

// ─── Template definitions ──────────────────────────────────────────────────────

interface ColDef {
  header: string
  width: number
  numFmt?: string
  examples: (string | number)[]
}

interface TemplateDef {
  sheetName: string
  description: string
  cols: ColDef[]
}

const TEMPLATES: Record<string, TemplateDef> = {
  leads: {
    sheetName: 'Leads',
    description: 'MMID master list assigned to the telesales team',
    cols: [
      { header: 'mmid',              width: 18, examples: ['TH-100001', 'TH-100002'] },
      { header: 'tier',              width: 12, examples: ['Gold', 'Silver'] },
      { header: 'lead_customers',    width: 20, examples: ['FOOD RETAILER', 'HORECA'] },
      { header: 'senior_buyer_name', width: 24, examples: ['Somchai K.', 'Pranee S.'] },
    ],
  },

  telesales_calls: {
    sheetName: 'Telesales Calls',
    description: 'Call log with agent, call status, and first connected date',
    cols: [
      { header: 'mmid',                 width: 18, examples: ['TH-100001', 'TH-100002'] },
      { header: 'agent',                width: 20, examples: ['Agent01', 'Agent02'] },
      { header: 'call_status',          width: 36, examples: ['สั่งซื้อสินค้าเรียบร้อย', 'ไม่รับสาย (ครั้งที่ 1)'] },
      { header: 'first_connected_date', width: 22, examples: ['2026-01-15', '2026-01-16'] },
    ],
  },

  online_sales: {
    sheetName: 'Online Sales',
    description: 'HOC Unilever online order lines',
    cols: [
      { header: 'order_number',  width: 20, examples: ['ORD-2026-0001', 'ORD-2026-0002'] },
      { header: 'order_date',    width: 14, examples: ['2026-01-15', '2026-01-15'] },
      { header: 'mmid',          width: 18, examples: ['TH-100001', 'TH-100001'] },
      { header: 'prod_num',      width: 16, examples: ['SKU-001', 'SKU-002'] },
      { header: 'dynamic_cmg',   width: 18, examples: ['FOOD RETAILER', 'HORECA'] },
      { header: 'sales_qty',     width: 12, numFmt: '#,##0',    examples: [10, 5] },
      { header: 'sales_in_vat',  width: 16, numFmt: '#,##0.00', examples: [1070.00, 535.00] },
    ],
  },

  offline_sales: {
    sheetName: 'Offline Sales',
    description: 'HOC Unilever offline order lines (same schema as Online Sales)',
    cols: [
      { header: 'order_number',  width: 20, examples: ['OFF-2026-0001', 'OFF-2026-0002'] },
      { header: 'order_date',    width: 14, examples: ['2026-01-16', '2026-01-16'] },
      { header: 'mmid',          width: 18, examples: ['TH-100003', 'TH-100004'] },
      { header: 'prod_num',      width: 16, examples: ['SKU-003', 'SKU-004'] },
      { header: 'dynamic_cmg',   width: 18, examples: ['FOOD RETAILER', 'DISTRIBUTOR'] },
      { header: 'sales_qty',     width: 12, numFmt: '#,##0',    examples: [20, 8] },
      { header: 'sales_in_vat',  width: 16, numFmt: '#,##0.00', examples: [2140.00, 856.00] },
    ],
  },

  products: {
    sheetName: 'Products',
    description: 'SKU master — product name, brand, class, buyer hierarchy',
    cols: [
      { header: 'prod_num',        width: 16, examples: ['SKU-001', 'SKU-002'] },
      { header: 'product_name_th', width: 32, examples: ['โดฟ แชมพู 330มล.', 'ซันซิลก์ คอนดิชั่นเนอร์ 300มล.'] },
      { header: 'product_name_en', width: 32, examples: ['Dove Shampoo 330ml', 'Sunsilk Conditioner 300ml'] },
      { header: 'brands',          width: 16, examples: ['Dove', 'Sunsilk'] },
      { header: 'class_name',      width: 20, examples: ['Hair Care', 'Hair Care'] },
      { header: 'subclass',        width: 20, examples: ['Shampoo', 'Conditioner'] },
      { header: 'senior_buyer_name', width: 24, examples: ['Somchai K.', 'Somchai K.'] },
      { header: 'buyer_name',      width: 24, examples: ['Pranee S.', 'Pranee S.'] },
    ],
  },

  targets: {
    sheetName: 'Targets',
    description: 'Monthly sales targets per CMG',
    cols: [
      { header: 'month',        width: 14, examples: ['2026-01-01', '2026-01-01'] },
      { header: 'dynamic_cmg',  width: 18, examples: ['FOOD RETAILER', 'HORECA'] },
      { header: 'sales_target', width: 18, numFmt: '#,##0.00', examples: [5000000, 2000000] },
    ],
  },

  costs: {
    sheetName: 'Costs',
    description: 'Monthly cost per head (agent and supervisor)',
    cols: [
      { header: 'month',               width: 14, examples: ['2026-01-01', '2026-02-01'] },
      { header: 'cost_per_agent',      width: 20, numFmt: '#,##0.00', examples: [15000, 15000] },
      { header: 'cost_per_supervisor', width: 24, numFmt: '#,##0.00', examples: [25000, 25000] },
    ],
  },

  agent_headcount: {
    sheetName: 'Agent Headcount',
    description: 'Monthly FTE headcount (agents and supervisors)',
    cols: [
      { header: 'month',            width: 14, examples: ['2026-01-01', '2026-02-01'] },
      { header: 'agent_count',      width: 16, numFmt: '#,##0', examples: [20, 20] },
      { header: 'supervisor_count', width: 20, numFmt: '#,##0', examples: [3, 3] },
    ],
  },

  incentives: {
    sheetName: 'Incentive Tiers',
    description: 'Achievement threshold → incentive rate per head',
    cols: [
      { header: 'tier',               width: 10, numFmt: '0.00', examples: [0.80, 1.00] },
      { header: 'incentive_per_head', width: 22, numFmt: '#,##0.00', examples: [500, 1000] },
    ],
  },
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  return withAdmin(async () => {
    const { file } = await params
    const tmpl = TEMPLATES[file]
    if (!tmpl) {
      return NextResponse.json({ error: `Unknown template: ${file}` }, { status: 404 })
    }

    const ExcelJS  = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Unilever Dashboard'
    workbook.created = new Date()

    // ── Data sheet ────────────────────────────────────────────────────────────
    const sheet = workbook.addWorksheet(tmpl.sheetName)

    // Header row
    sheet.addRow(tmpl.cols.map(c => c.header))
    const headerRow = sheet.getRow(1)
    headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003DA6' } }
    headerRow.alignment = { vertical: 'middle' }
    headerRow.height    = 20

    // Freeze header + auto filter
    sheet.views     = [{ state: 'frozen', ySplit: 1, xSplit: 0 }]
    sheet.autoFilter = { from: 'A1', to: { row: 1, column: tmpl.cols.length } }

    // Example rows (light grey background)
    const exampleCount = tmpl.cols[0].examples.length
    for (let i = 0; i < exampleCount; i++) {
      const row = sheet.addRow(tmpl.cols.map(c => c.examples[i] ?? ''))
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } }
      row.font = { italic: true, color: { argb: 'FF888888' } }
    }

    // Column widths + number formats
    tmpl.cols.forEach((c, i) => {
      const col  = sheet.getColumn(i + 1)
      col.width  = c.width
      if (c.numFmt) col.numFmt = c.numFmt
    })

    // ── Notes sheet ───────────────────────────────────────────────────────────
    const notes = workbook.addWorksheet('Notes')
    notes.getColumn(1).width = 24
    notes.getColumn(2).width = 60

    notes.addRow(['Template', tmpl.sheetName])
    notes.addRow(['Description', tmpl.description])
    notes.addRow(['Generated', new Date().toLocaleString('en-GB')])
    notes.addRow([])
    notes.addRow(['Column', 'Notes'])
    const notesHeader = notes.getRow(5)
    notesHeader.font = { bold: true }
    notesHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }

    tmpl.cols.forEach(c => {
      notes.addRow([c.header, c.numFmt ? `Number format: ${c.numFmt}` : 'Text'])
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const filename = `template_${file}_${new Date().toISOString().slice(0, 10)}.xlsx`

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  })
}
