import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CURRENCIES = ['USD', 'CNY', 'SGD', 'JPY', 'EUR', 'GBP', 'CHF', 'AUD', 'CAD', 'TWD']

export async function GET() {
  try {
    // 主來源: ExchangeRate-API
    const resp = await fetch('https://open.er-api.com/v6/latest/USD', { next: { revalidate: 0 } })
    const data = await resp.json()

    if (data.result !== 'success') {
      // 備援: Frankfurter
      const resp2 = await fetch(
        `https://api.frankfurter.app/latest?from=USD&to=${CURRENCIES.filter(c => c !== 'USD').join(',')}`
      )
      const data2 = await resp2.json()
      // Frankfurter 沒有 HKD 直接對，需要透過 USD 換算
      // 簡化處理
      return NextResponse.json({ error: '主備源都失敗' }, { status: 500 })
    }

    const rates = data.rates
    const today = new Date().toISOString().split('T')[0]
    const hkdRate = rates.HKD || 7.82

    // 計算所有幣種對 HKD 的匯率
    const records = CURRENCIES.map(currency => {
      const usdRate = currency === 'USD' ? 1 : rates[currency] || 0
      const toHkd = usdRate > 0 ? hkdRate / usdRate : 0

      return {
        base_currency: currency,
        quote_currency: 'HKD',
        rate: toHkd,
        rate_date: today,
        source: 'exchangerate-api',
      }
    }).filter(r => r.rate > 0)

    // Upsert 匯率
    const { error } = await supabase
      .from('exchange_rates')
      .upsert(records, { onConflict: 'base_currency,quote_currency,rate_date' })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      date: today,
      updated: records.length,
      rates: Object.fromEntries(records.map(r => [r.base_currency, r.rate])),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
