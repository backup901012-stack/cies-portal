// Excel 匯入邏輯：解析 CIES 標準 Excel 並轉換為 funds + transactions 資料
import type { SupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

interface ParsedTransaction {
  trade_date: string
  type: '買入' | '賣出' | '派息' | '管理費'
  nav: number | null
  shares: number | null
  dividend_amount: number | null
  fee: number
  currency: string
  total_amount: number
  total_hkd: number
  isin: string
  fund_name: string
  area: string
  style: string         // 風格：股票基金、債券基金 etc.
  investment_style: string  // 策略：保守型、平衡型、進取型
  notes: string | null
}

// 從 Excel 提取客戶資訊（客戶編號 + 姓名）
export function parseClientInfo(fileBuffer: ArrayBuffer): { client_code: string; name: string } | null {
  const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true })

  // 找「現金流」工作表
  const sheetName = workbook.SheetNames.find(name => name.includes('現金流'))
  if (!sheetName) return null

  const ws = workbook.Sheets[sheetName]

  // 掃描前 10 行，找「P00xxxx 姓名」格式的儲存格
  // Excel 格式：第3行B欄 = "P005812NC 俞悅 — CIES 投資組合現金流追蹤"
  for (let r = 0; r <= 10; r++) {
    for (let c = 0; c <= 5; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (!cell) continue
      const val = String(cell.v).trim()

      // 匹配 "P005812NC 俞悅" 或 "P005812NC 俞悅 — ..."
      const match = val.match(/^(P\d{6}\w{0,4})\s+(.+?)(?:\s+[—\-–]|$)/)
      if (match) {
        return { client_code: match[1], name: match[2].trim() }
      }
    }
  }

  // 備用：找持倉配置表
  const holdingSheet = workbook.SheetNames.find(name => name.includes('持倉'))
  if (holdingSheet) {
    const ws2 = workbook.Sheets[holdingSheet]
    for (let r = 0; r <= 10; r++) {
      for (let c = 0; c <= 5; c++) {
        const cell = ws2[XLSX.utils.encode_cell({ r, c })]
        if (!cell) continue
        const val = String(cell.v).trim()
        const match = val.match(/^(P\d{6}\w{0,4})\s+(.+?)(?:\s+[—\-–]|$)/)
        if (match) {
          return { client_code: match[1], name: match[2].trim() }
        }
      }
    }
  }

  return null
}

// 科目中文映射
const typeMap: Record<string, '買入' | '賣出' | '派息' | '管理費'> = {
  '買入': '買入',
  '賣出': '賣出',
  '派息': '派息',
  '管理費': '管理費',
  'buy': '買入',
  'sell': '賣出',
  'dividend': '派息',
  'fee': '管理費',
}

// 從 Excel 的現金流工作表解析交易
function parseCashflowSheet(worksheet: XLSX.WorkSheet): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = []
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')

  // 找出標題行（含有「日期」「科目」的行）
  let headerRow = -1
  for (let r = 0; r <= Math.min(range.e.r, 10); r++) {
    const cellB = worksheet[XLSX.utils.encode_cell({ r, c: 1 })]
    if (cellB && String(cellB.v).trim() === '日期') {
      headerRow = r
      break
    }
  }

  if (headerRow === -1) return transactions

  // 標題欄位對應（根據你的 Excel 格式）
  // B=日期, C=科目, D=交易淨值, E=交易股數, F=派息金額, G=手續費, H=幣種, I=總金額(原幣), J=等同美金, K=等同港幣
  // L=ISIN CODE, M=資產名稱, N=區域, O=風格, P=策略, Q=備註

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const getVal = (col: number) => {
      const cell = worksheet[XLSX.utils.encode_cell({ r, c: col })]
      return cell ? cell.v : null
    }

    const dateVal = getVal(1)
    if (!dateVal) continue  // 跳過空行

    // 解析日期
    let tradeDate: string
    if (dateVal instanceof Date) {
      tradeDate = dateVal.toISOString().split('T')[0]
    } else if (typeof dateVal === 'number') {
      // Excel 序列日期數字
      const d = XLSX.SSF.parse_date_code(dateVal)
      tradeDate = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
    } else {
      const parsed = new Date(String(dateVal))
      if (isNaN(parsed.getTime())) continue
      tradeDate = parsed.toISOString().split('T')[0]
    }

    const typeStr = String(getVal(2) || '').trim()
    const type = typeMap[typeStr]
    if (!type) continue  // 跳過非交易行（如「期末估值」）

    const nav = getVal(3) ? Number(getVal(3)) : null
    const shares = getVal(4) ? Number(getVal(4)) : null
    const dividendAmount = getVal(5) ? Number(getVal(5)) : null
    const fee = Number(getVal(6)) || 0
    const currency = String(getVal(7) || 'HKD').trim()
    const totalAmount = Number(getVal(8)) || 0
    const totalHkd = Number(getVal(10)) || Math.abs(totalAmount) * (currency === 'USD' ? 7.82 : 1)
    const isin = String(getVal(11) || '').trim()
    const fundName = String(getVal(12) || '').trim()
    const area = String(getVal(13) || '').trim()
    const style = String(getVal(14) || '').trim()
    const investmentStyle = String(getVal(15) || '').trim()
    const notes = getVal(16) ? String(getVal(16)).trim() : null

    if (!isin) continue  // 沒有 ISIN 碼就跳過

    transactions.push({
      trade_date: tradeDate,
      type,
      nav,
      shares,
      dividend_amount: dividendAmount,
      fee,
      currency,
      total_amount: totalAmount,
      total_hkd: totalHkd,
      isin,
      fund_name: fundName,
      area,
      style,
      investment_style: investmentStyle,
      notes,
    })
  }

  return transactions
}

export interface ImportResult {
  fundsCreated: number
  fundsExisted: number
  transactionsCreated: number
  errors: string[]
}

// 主匯入函式
export async function importExcelToDatabase(
  fileBuffer: ArrayBuffer,
  clientId: string,
  supabase: SupabaseClient
): Promise<ImportResult> {
  const errors: string[] = []
  let fundsCreated = 0
  let fundsExisted = 0
  let transactionsCreated = 0

  // 解析 Excel
  const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true })

  // 找「現金流」工作表
  const cashflowSheetName = workbook.SheetNames.find(
    name => name.includes('現金流')
  )
  if (!cashflowSheetName) {
    return { fundsCreated: 0, fundsExisted: 0, transactionsCreated: 0, errors: ['找不到「現金流」工作表'] }
  }

  const worksheet = workbook.Sheets[cashflowSheetName]
  const parsedTxs = parseCashflowSheet(worksheet)

  if (parsedTxs.length === 0) {
    return { fundsCreated: 0, fundsExisted: 0, transactionsCreated: 0, errors: ['沒有解析到任何交易記錄'] }
  }

  // 收集所有不重複的基金
  const uniqueFunds = new Map<string, ParsedTransaction>()
  for (const tx of parsedTxs) {
    if (!uniqueFunds.has(tx.isin)) {
      uniqueFunds.set(tx.isin, tx)
    }
  }

  // 查詢已存在的基金
  const { data: existingFunds } = await supabase
    .from('funds')
    .select('id, isin')
  const isinToId = new Map<string, string>()
  existingFunds?.forEach(f => isinToId.set(f.isin, f.id))

  // 建立新基金
  for (const [isin, tx] of uniqueFunds) {
    if (isinToId.has(isin)) {
      fundsExisted++
      continue
    }

    const { data, error } = await supabase
      .from('funds')
      .insert({
        isin,
        bloomberg_ticker: isin.includes('Equity') ? isin.replace('HKEQ', ' HK Equity') : null,
        name_zh: tx.fund_name || null,
        fund_type: tx.style || null,
        area: tx.area || null,
        style: tx.investment_style || null,
        currency: tx.currency || 'HKD',
        cies_eligible: true,
      })
      .select('id')
      .single()

    if (error) {
      errors.push(`基金 ${isin} 建立失敗: ${error.message}`)
    } else if (data) {
      isinToId.set(isin, data.id)
      fundsCreated++
    }
  }

  // 匯入交易
  for (const tx of parsedTxs) {
    const fundId = isinToId.get(tx.isin)
    if (!fundId) {
      errors.push(`找不到基金 ${tx.isin}，跳過交易`)
      continue
    }

    const { error } = await supabase.from('transactions').insert({
      client_id: clientId,
      fund_id: fundId,
      trade_date: tx.trade_date,
      type: tx.type,
      nav: tx.nav,
      shares: tx.shares,
      dividend_amount: tx.dividend_amount,
      fee: tx.fee,
      currency: tx.currency,
      total_amount: Math.abs(tx.total_amount),
      total_hkd: Math.abs(tx.total_hkd),
      notes: tx.notes,
    })

    if (error) {
      errors.push(`交易匯入失敗 (${tx.trade_date} ${tx.isin}): ${error.message}`)
    } else {
      transactionsCreated++

      // 同時記錄淨值
      if (tx.nav && tx.nav > 0) {
        await supabase.from('fund_prices').upsert({
          fund_id: fundId,
          price_date: tx.trade_date,
          nav: tx.nav,
          currency: tx.currency,
          source: 'excel_import',
        }, { onConflict: 'fund_id,price_date' })
      }
    }
  }

  // 從「持倉比例配置表」抓最新淨值
  const holdingSheetName = workbook.SheetNames.find(name => name.includes('持倉'))
  if (holdingSheetName) {
    const holdingWs = workbook.Sheets[holdingSheetName]
    const holdingRange = XLSX.utils.decode_range(holdingWs['!ref'] || 'A1')

    // 找標題行（含有「ISIN CODE」的行）
    let hHeaderRow = -1
    for (let r = 0; r <= Math.min(holdingRange.e.r, 10); r++) {
      for (let c = 0; c <= 5; c++) {
        const cell = holdingWs[XLSX.utils.encode_cell({ r, c })]
        if (cell && String(cell.v).includes('ISIN')) {
          hHeaderRow = r
          break
        }
      }
      if (hHeaderRow >= 0) break
    }

    // 找日期欄（通常在第1行C欄）
    let navDate = new Date().toISOString().split('T')[0]
    for (let r = 0; r <= 3; r++) {
      for (let c = 1; c <= 5; c++) {
        const cell = holdingWs[XLSX.utils.encode_cell({ r, c })]
        if (cell && cell.v instanceof Date) {
          navDate = cell.v.toISOString().split('T')[0]
          break
        }
        if (cell && typeof cell.v === 'number' && cell.v > 40000 && cell.v < 50000) {
          const d = XLSX.SSF.parse_date_code(cell.v)
          navDate = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
          break
        }
      }
    }

    if (hHeaderRow >= 0) {
      // 持倉表格式：B=ISIN, L=最新淨值（第11欄，index 11）
      for (let r = hHeaderRow + 1; r <= holdingRange.e.r; r++) {
        const getHVal = (col: number) => {
          const cell = holdingWs[XLSX.utils.encode_cell({ r, c: col })]
          return cell ? cell.v : null
        }

        const isin = String(getHVal(1) || '').trim()
        if (!isin || isin === '' || isin.includes('小計') || isin.includes('總計')) continue

        const latestNav = getHVal(11)
        if (!latestNav || typeof latestNav !== 'number' || latestNav <= 0) continue
        if (String(latestNav).includes('N/A')) continue

        const fundId = isinToId.get(isin)
        if (!fundId) continue

        // 寫入最新淨值
        const fund = uniqueFunds.get(isin) || parsedTxs.find(t => t.isin === isin)
        await supabase.from('fund_prices').upsert({
          fund_id: fundId,
          price_date: navDate,
          nav: latestNav,
          currency: fund?.currency || 'USD',
          source: 'excel_holding',
        }, { onConflict: 'fund_id,price_date' })
      }
    }
  }

  return { fundsCreated, fundsExisted, transactionsCreated, errors }
}

// 下載標準模板
export function generateTemplate(): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  // 現金流工作表
  const headers = [
    '', '日期', '科目', '交易淨值', '交易股數', '派息金額',
    '手續費', '幣種', '總金額(原幣)', '等同美金(USD)', '等同港幣(HKD)',
    'ISIN CODE', '資產名稱', '區域', '風格', '策略', '備註'
  ]

  const sampleData = [
    ['', '使用說明：藍色欄位需手動填入。科目可填：買入/賣出/派息/管理費'],
    [''],
    headers,
    ['', '2026-03-16', '買入', 28.4, 39000, '', 2355.87, 'HKD', 1109955.87, '', 1109955.87, '3160 HK Equity', '華夏 MSCI 日本股票 ETF', '日本', '股票基金', '進取型', ''],
    ['', '2026-03-16', '買入', 82.5, 1600, '', 792, 'USD', 132792, 132792, 1038433.44, 'LU1525638091', 'DWS-亞洲債券', '亞太', '債券基金', '保守型', ''],
    ['', '2026-04-01', '派息', '', '', 500, '', 'USD', 500, 500, 3910, 'LU1525638091', 'DWS-亞洲債券', '亞太', '債券基金', '保守型', '季度派息'],
  ]

  const ws = XLSX.utils.aoa_to_sheet(sampleData)
  XLSX.utils.book_append_sheet(wb, ws, '現金流(手動)')

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}
