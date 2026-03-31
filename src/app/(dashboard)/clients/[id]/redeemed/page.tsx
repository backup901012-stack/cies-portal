'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface RedeemedFund {
  isin: string
  name: string
  buyCost: number
  sellAmount: number
  totalDividends: number
  actualReturn: number
  returnRate: number
  tvpi: number
}

export default function RedeemedPage() {
  const { id } = useParams<{ id: string }>()
  const [redeemed, setRedeemed] = useState<RedeemedFund[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { loadRedeemed() }, [id])

  async function loadRedeemed() {
    const { data: txData } = await supabase
      .from('transactions')
      .select('*, fund:funds(*)')
      .eq('client_id', id)
      .order('trade_date')

    if (!txData?.length) { setLoading(false); return }

    // 按基金分組，找出淨持倉 = 0 的
    const byFund = new Map<string, typeof txData>()
    for (const tx of txData) {
      if (!byFund.has(tx.fund_id)) byFund.set(tx.fund_id, [])
      byFund.get(tx.fund_id)!.push(tx)
    }

    const results: RedeemedFund[] = []
    for (const [, txs] of byFund) {
      let shares = 0
      let buyCost = 0
      let sellAmount = 0
      let dividends = 0

      for (const tx of txs) {
        const hkd = Math.abs(tx.total_hkd || 0)
        if (tx.type === '買入') { shares += (tx.shares || 0); buyCost += hkd }
        else if (tx.type === '賣出') { shares -= Math.abs(tx.shares || 0); sellAmount += hkd }
        else if (tx.type === '派息') { dividends += hkd }
      }

      // 淨持倉 ≈ 0 視為已贖回
      if (Math.abs(shares) < 0.01 && buyCost > 0) {
        const actualReturn = sellAmount + dividends - buyCost
        results.push({
          isin: txs[0].fund?.isin || '-',
          name: txs[0].fund?.name_zh || txs[0].fund?.name_en || '-',
          buyCost,
          sellAmount,
          totalDividends: dividends,
          actualReturn,
          returnRate: buyCost > 0 ? actualReturn / buyCost : 0,
          tvpi: buyCost > 0 ? (sellAmount + dividends) / buyCost : 0,
        })
      }
    }

    setRedeemed(results)
    setLoading(false)
  }

  function fmtNum(n: number): string {
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-800 mb-4">已贖回基金表現</h2>
      <p className="text-sm text-gray-500 mb-4">自動偵測淨持倉為 0 的基金</p>

      {loading ? (
        <p className="text-gray-400 py-8 text-center">載入中...</p>
      ) : redeemed.length === 0 ? (
        <p className="text-gray-400 py-8 text-center">目前沒有已贖回的基金</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">ISIN</th>
                <th className="text-left px-4 py-3 font-medium">名稱</th>
                <th className="text-right px-4 py-3 font-medium">買入成本(HKD)</th>
                <th className="text-right px-4 py-3 font-medium">賣出金額(HKD)</th>
                <th className="text-right px-4 py-3 font-medium">累計派息(HKD)</th>
                <th className="text-right px-4 py-3 font-medium">實際收益(HKD)</th>
                <th className="text-right px-4 py-3 font-medium">回報率</th>
                <th className="text-right px-4 py-3 font-medium">TVPI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {redeemed.map(r => (
                <tr key={r.isin} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs">{r.isin}</td>
                  <td className="px-4 py-2.5">{r.name}</td>
                  <td className="px-4 py-2.5 text-right">{fmtNum(r.buyCost)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtNum(r.sellAmount)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtNum(r.totalDividends)}</td>
                  <td className={`px-4 py-2.5 text-right font-bold ${r.actualReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {r.actualReturn >= 0 ? '+' : ''}{fmtNum(r.actualReturn)}
                  </td>
                  <td className={`px-4 py-2.5 text-right ${r.returnRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(r.returnRate * 100).toFixed(2)}%
                  </td>
                  <td className="px-4 py-2.5 text-right">{r.tvpi.toFixed(2)}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
