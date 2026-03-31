'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calculateXIRR } from '@/lib/holdings'
import type { Fund } from '@/types/database'

interface IrrResult {
  label: string
  isin: string
  irr: number
  cashflows: number
}

export default function IrrPage() {
  const { id } = useParams<{ id: string }>()
  const [results, setResults] = useState<IrrResult[]>([])
  const [overallIrr, setOverallIrr] = useState(0)
  const [valuationDate, setValuationDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { loadIrr() }, [id, valuationDate])

  async function loadIrr() {
    setLoading(true)
    const { data: txData } = await supabase
      .from('transactions')
      .select('*, fund:funds(*)')
      .eq('client_id', id)
      .order('trade_date')

    if (!txData?.length) { setLoading(false); return }

    // 取最新淨值 & 匯率
    const fundsMap = new Map<string, Fund>()
    for (const tx of txData) { if (tx.fund) fundsMap.set(tx.fund.id, tx.fund) }

    const navsMap = new Map<string, number>()
    for (const fid of fundsMap.keys()) {
      const { data } = await supabase.from('fund_prices').select('nav').eq('fund_id', fid).order('price_date', { ascending: false }).limit(1)
      if (data?.[0]) navsMap.set(fid, Number(data[0].nav))
    }

    const ratesMap = new Map<string, number>()
    const { data: ratesData } = await supabase.from('exchange_rates').select('*').eq('quote_currency', 'HKD').order('rate_date', { ascending: false })
    if (ratesData) {
      const seen = new Set<string>()
      for (const r of ratesData) { if (!seen.has(r.base_currency)) { ratesMap.set(r.base_currency, Number(r.rate)); seen.add(r.base_currency) } }
    }

    // 按基金計算 IRR
    const byFund = new Map<string, typeof txData>()
    for (const tx of txData) {
      if (!byFund.has(tx.fund_id)) byFund.set(tx.fund_id, [])
      byFund.get(tx.fund_id)!.push(tx)
    }

    const fundResults: IrrResult[] = []
    const allCashflows: { date: Date; amount: number }[] = []

    for (const [fundId, txs] of byFund) {
      const fund = fundsMap.get(fundId)
      if (!fund) continue

      const currency = fund.currency || 'HKD'
      const hkdRate = currency === 'HKD' ? 1 : (ratesMap.get(currency) || 7.82)
      const nav = navsMap.get(fundId) || txs[txs.length - 1]?.nav || 0

      // 建立現金流
      const cashflows: { date: Date; amount: number }[] = []
      let totalShares = 0

      for (const tx of txs) {
        const hkd = tx.total_hkd || 0
        cashflows.push({ date: new Date(tx.trade_date), amount: hkd })
        allCashflows.push({ date: new Date(tx.trade_date), amount: hkd })

        if (tx.type === '買入') totalShares += (tx.shares || 0)
        else if (tx.type === '賣出') totalShares -= Math.abs(tx.shares || 0)
      }

      // 加入期末估值
      if (totalShares > 0) {
        const endValue = nav * totalShares * hkdRate
        cashflows.push({ date: new Date(valuationDate), amount: endValue })
        allCashflows.push({ date: new Date(valuationDate), amount: endValue })
      }

      const irr = calculateXIRR(cashflows)
      fundResults.push({
        label: fund.name_zh || fund.isin,
        isin: fund.isin,
        irr,
        cashflows: cashflows.length,
      })
    }

    // 整體 IRR
    const overall = calculateXIRR(allCashflows)
    setOverallIrr(overall)
    setResults(fundResults.sort((a, b) => b.irr - a.irr))
    setLoading(false)
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-lg font-bold text-gray-800">IRR 計算</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">估值日期:</label>
          <input
            type="date"
            value={valuationDate}
            onChange={(e) => setValuationDate(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 py-8 text-center">計算中...</p>
      ) : results.length === 0 ? (
        <p className="text-gray-400 py-8 text-center">尚無交易記錄</p>
      ) : (
        <>
          {/* 整體 IRR */}
          <div className="bg-slate-800 text-white rounded-xl p-6 mb-6 text-center">
            <p className="text-slate-400 text-sm">整體投資組合 IRR（年化）</p>
            <p className={`text-4xl font-bold mt-2 ${overallIrr >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(overallIrr * 100).toFixed(2)}%
            </p>
          </div>

          {/* 各基金 IRR */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">基金名稱</th>
                  <th className="text-left px-4 py-3 font-medium">ISIN</th>
                  <th className="text-right px-4 py-3 font-medium">IRR（年化）</th>
                  <th className="text-right px-4 py-3 font-medium">現金流筆數</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map(r => (
                  <tr key={r.isin} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">{r.label}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{r.isin}</td>
                    <td className={`px-4 py-2.5 text-right font-bold ${r.irr >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {(r.irr * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{r.cashflows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
