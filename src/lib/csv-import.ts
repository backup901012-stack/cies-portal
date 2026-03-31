// CSV 匯入邏輯：解析 ALL_MF CSV 並轉換為 funds + monthly_returns 資料
import type { SupabaseClient } from '@supabase/supabase-js'

interface CsvRow {
  'ISIN CODE': string
  'bloomberg Ticker': string
  'investmentStyle': string
  'bloomberg name': string
  'Chinese name': string
  'fund type': string
  'area': string
  'style': string
  'cies_eligible': string
  'currency': string
  'dividend_frequency': string
  [key: string]: string // 月度回報欄位 (YYYY-MM)
}

// Bloomberg ticker 轉 Yahoo Finance ticker
function bloombergToYahoo(bbgTicker: string): string | null {
  const bbg = bbgTicker.trim()

  // HK Equity → ISIN 直接查或轉 .HK
  const hkMatch = bbg.match(/^(\w+)\s+HK\s+Equity$/i)
  if (hkMatch) {
    const code = hkMatch[1]
    // 如果是純數字（ETF），轉成 .HK 格式
    if (/^\d+$/.test(code)) {
      return `${code.padStart(4, '0')}.HK`
    }
    return null // 非 ETF 的 HK 基金用 ISIN 查
  }

  // LX Equity → 用 ISIN 查
  if (/LX\s+Equity$/i.test(bbg)) return null

  // ID Equity → 用 ISIN 查
  if (/ID\s+Equity$/i.test(bbg)) return null

  // TT Equity → .TW
  const ttMatch = bbg.match(/^(\w+)\s+TT\s+Equity$/i)
  if (ttMatch) return `${ttMatch[1]}.TW`

  // JT Equity → .T
  const jtMatch = bbg.match(/^(\w+)\s+JT\s+Equity$/i)
  if (jtMatch) return `${jtMatch[1]}.T`

  // US Equity
  const usMatch = bbg.match(/^(\w+)\s+US\s+Equity$/i)
  if (usMatch) return usMatch[1]

  // SW Equity → .SW
  const swMatch = bbg.match(/^(\w+)\s+SW\s+Equity$/i)
  if (swMatch) return `${swMatch[1]}.SW`

  return null
}

// 判斷淨值抓取來源
function determineNavSource(isin: string, fundType: string, bbgTicker: string): string {
  // ETF 用 Yahoo
  if (fundType === 'ETF') return 'yahoo'
  // HK 基金用 Yahoo（ISIN 直查）
  if (isin.startsWith('HK')) return 'yahoo'
  // LU/IE 基金用 Frankfurt
  if (isin.startsWith('LU') || isin.startsWith('IE')) return 'frankfurt'
  // 私募用手動
  if (fundType === '私募基金') return 'manual'
  // 其他嘗試 Yahoo
  return 'yahoo'
}

export async function importCsvToDatabase(
  csvText: string,
  supabase: SupabaseClient
): Promise<{ fundsCount: number; returnsCount: number; errors: string[] }> {
  const errors: string[] = []

  // 解析 CSV
  const lines = csvText.split('\n').filter(l => l.trim())
  if (lines.length < 2) {
    return { fundsCount: 0, returnsCount: 0, errors: ['CSV 檔案為空'] }
  }

  // 移除 BOM
  const headerLine = lines[0].replace(/^\uFEFF/, '')
  const headers = headerLine.split(',').map(h => h.trim())

  // 找出月度回報欄位
  const dateColumns = headers.filter(h => /^\d{4}-\d{2}$/.test(h))

  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',')
    if (values.length < headers.length) continue
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx]?.trim() || ''
    })
    rows.push(row as CsvRow)
  }

  // 批量 upsert 基金
  const fundsData = rows.map(row => {
    const isin = row['ISIN CODE']?.trim()
    const bbg = row['bloomberg Ticker']?.trim()
    const yahooTicker = bloombergToYahoo(bbg)

    return {
      isin,
      bloomberg_ticker: bbg || null,
      yahoo_ticker: yahooTicker || isin, // 沒有 Yahoo ticker 就用 ISIN
      name_en: row['bloomberg name']?.trim() || null,
      name_zh: row['Chinese name']?.trim() || null,
      fund_type: row['fund type']?.trim() || null,
      investment_style: row['investmentStyle']?.trim() || null,
      area: row['area']?.trim() || null,
      style: row['style']?.trim() || null,
      currency: row['currency']?.trim() || null,
      cies_eligible: row['cies_eligible']?.trim() === 'CIES',
      dividend_frequency: row['dividend_frequency']?.trim() || null,
      nav_source: determineNavSource(isin, row['fund type']?.trim(), bbg),
      updated_at: new Date().toISOString(),
    }
  }).filter(f => f.isin)

  // 分批 upsert（每批 200 筆）
  let fundsInserted = 0
  for (let i = 0; i < fundsData.length; i += 200) {
    const batch = fundsData.slice(i, i + 200)
    const { error } = await supabase
      .from('funds')
      .upsert(batch, { onConflict: 'isin' })
    if (error) {
      errors.push(`基金匯入錯誤 (batch ${i}): ${error.message}`)
    } else {
      fundsInserted += batch.length
    }
  }

  // 取得所有基金的 id 映射
  const { data: allFunds } = await supabase
    .from('funds')
    .select('id, isin')
  const isinToId = new Map<string, string>()
  allFunds?.forEach(f => isinToId.set(f.isin, f.id))

  // 批量 upsert 月度回報
  let returnsInserted = 0
  const returnsData: { fund_id: string; year_month: string; return_rate: number }[] = []

  for (const row of rows) {
    const isin = row['ISIN CODE']?.trim()
    const fundId = isinToId.get(isin)
    if (!fundId) continue

    for (const ym of dateColumns) {
      const val = row[ym]
      if (!val || val === '') continue
      const rate = parseFloat(val)
      if (isNaN(rate)) continue
      returnsData.push({
        fund_id: fundId,
        year_month: ym,
        return_rate: rate,
      })
    }
  }

  // 分批 upsert 月度回報（每批 500 筆）
  for (let i = 0; i < returnsData.length; i += 500) {
    const batch = returnsData.slice(i, i + 500)
    const { error } = await supabase
      .from('fund_monthly_returns')
      .upsert(batch, { onConflict: 'fund_id,year_month' })
    if (error) {
      errors.push(`月度回報匯入錯誤 (batch ${i}): ${error.message}`)
    } else {
      returnsInserted += batch.length
    }
  }

  return {
    fundsCount: fundsInserted,
    returnsCount: returnsInserted,
    errors,
  }
}
