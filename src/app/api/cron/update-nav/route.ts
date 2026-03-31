import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Yahoo Finance v8 chart API 抓淨值
async function fetchYahooNav(ticker: string): Promise<{ price: number; currency: string } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    })
    if (resp.status === 429) return null // rate limited
    if (!resp.ok) return null

    const data = await resp.json()
    const result = data?.chart?.result?.[0]
    if (!result) return null

    const closes = result.indicators?.quote?.[0]?.close
    if (!closes?.length) return null

    // 取最後一個非 null 的值
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null) {
        return {
          price: closes[i],
          currency: result.meta?.currency || 'USD',
        }
      }
    }
    return null
  } catch {
    return null
  }
}

// Yahoo Search API 找替代 ticker
async function searchYahooTicker(isin: string): Promise<string | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${isin}&quotesCount=3&newsCount=0`
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!resp.ok) return null
    const data = await resp.json()
    const quotes = data?.quotes
    if (!quotes?.length) return null
    return quotes[0].symbol || null
  } catch {
    return null
  }
}

export async function GET() {
  const today = new Date().toISOString().split('T')[0]
  let updated = 0
  let failed = 0
  let skipped = 0
  const errors: string[] = []

  try {
    // 透過 view 查詢有持倉的基金（繞過 transactions RLS）
    const { data: activeIds } = await supabase
      .from('active_fund_ids')
      .select('fund_id')
    const uniqueFundIds = (activeIds || []).map(r => r.fund_id)

    if (!uniqueFundIds.length) {
      return NextResponse.json({ success: true, message: '無持倉基金', updated: 0 })
    }

    // 取所有有持倉的基金（不限 nav_source）
    const { data: funds } = await supabase
      .from('funds')
      .select('id, isin, yahoo_ticker, nav_source, currency')
      .in('id', uniqueFundIds)

    if (!funds?.length) {
      return NextResponse.json({ success: true, message: '無需更新的基金', updated: 0 })
    }

    // 分批處理，每批 5 個，間隔 1 秒（避免 rate limit）
    const batchSize = 5
    for (let i = 0; i < funds.length; i += batchSize) {
      const batch = funds.slice(i, i + batchSize)

      const results = await Promise.all(
        batch.map(async (fund) => {
          // 1. 有 yahoo_ticker 就直接用
          if (fund.yahoo_ticker) {
            const result = await fetchYahooNav(fund.yahoo_ticker)
            if (result) return { fund, result }
          }

          // 2. 用 ISIN 直接查
          const result = await fetchYahooNav(fund.isin)
          if (result) return { fund, result }

          // 3. 用 Yahoo Search 找替代 ticker
          const searchTicker = await searchYahooTicker(fund.isin)
          if (searchTicker) {
            const searchResult = await fetchYahooNav(searchTicker)
            if (searchResult) {
              // 儲存找到的 ticker，下次不用再搜尋
              await supabase.from('funds').update({
                yahoo_ticker: searchTicker,
                nav_source: 'yahoo',
              }).eq('id', fund.id)
              return { fund, result: searchResult }
            }
          }

          return { fund, result: null }
        })
      )

      // 寫入資料庫
      for (const { fund, result } of results) {
        if (result) {
          const { error } = await supabase.from('fund_prices').upsert({
            fund_id: fund.id,
            price_date: today,
            nav: result.price,
            currency: result.currency,
            source: 'yahoo',
          }, { onConflict: 'fund_id,price_date' })

          if (error) {
            errors.push(`${fund.isin}: ${error.message}`)
            failed++
          } else {
            updated++
          }
        } else {
          skipped++
        }
      }

      // 批次間等待 1 秒
      if (i + batchSize < funds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    return NextResponse.json({
      success: true,
      date: today,
      total: funds.length,
      updated,
      failed,
      skipped,
      errors: errors.slice(0, 10),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
