'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calculatePortfolio } from '@/lib/holdings'
import type { Fund, Transaction, PortfolioSummary } from '@/types/database'

type DisplayCurrency = 'HKD' | 'USD'

export default function ClientHoldingsPage() {
  const { id } = useParams<{ id: string }>()
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState<DisplayCurrency>('HKD')
  const [usdHkdRate, setUsdHkdRate] = useState(7.82)
  const supabase = createClient()

  useEffect(() => {
    loadPortfolio()
  }, [id])

  async function loadPortfolio() {
    const { data: txData } = await supabase
      .from('transactions')
      .select('*, fund:funds(*)')
      .eq('client_id', id)
      .order('trade_date')

    if (!txData || txData.length === 0) {
      setLoading(false)
      return
    }

    const fundsMap = new Map<string, Fund>()
    for (const tx of txData) {
      if (tx.fund) fundsMap.set(tx.fund.id, tx.fund)
    }

    const fundIds = [...fundsMap.keys()]
    const navsMap = new Map<string, number>()
    for (const fid of fundIds) {
      const { data: priceData } = await supabase
        .from('fund_prices')
        .select('nav')
        .eq('fund_id', fid)
        .order('price_date', { ascending: false })
        .limit(1)
      if (priceData?.[0]) {
        navsMap.set(fid, Number(priceData[0].nav))
      }
    }

    const ratesMap = new Map<string, number>()
    const { data: ratesData } = await supabase
      .from('exchange_rates')
      .select('*')
      .eq('quote_currency', 'HKD')
      .order('rate_date', { ascending: false })
    if (ratesData) {
      const seen = new Set<string>()
      for (const r of ratesData) {
        if (!seen.has(r.base_currency)) {
          ratesMap.set(r.base_currency, Number(r.rate))
          seen.add(r.base_currency)
        }
      }
    }

    // 儲存 USD/HKD 匯率
    const usdRate = ratesMap.get('USD') || 7.82
    setUsdHkdRate(usdRate)

    const result = calculatePortfolio(txData, fundsMap, navsMap, ratesMap)
    setPortfolio(result)
    setLoading(false)
  }

  // 幣別轉換係數
  const fx = currency === 'USD' ? (1 / usdHkdRate) : 1
  const ccy = currency

  function fmtNum(n: number, decimals = 0): string {
    return (n * fx).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }

  function fmtPct(n: number): string {
    return (n * 100).toFixed(2) + '%'
  }

  // 平均成本和淨值不需要轉換（已經是原幣）
  function fmtRaw(n: number, decimals = 4): string {
    return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }

  if (loading) {
    return <p className="text-gray-400 py-8 text-center">計算中...</p>
  }

  if (!portfolio) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p>尚無交易記錄</p>
        <p className="text-sm mt-2">前往「交易記錄」頁面新增交易</p>
      </div>
    )
  }

  return (
    <div>
      {/* 幣別切換 */}
      <div className="flex justify-end mb-4">
        <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setCurrency('HKD')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              currency === 'HKD' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            HKD
          </button>
          <button
            onClick={() => setCurrency('USD')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              currency === 'USD' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            USD
          </button>
        </div>
      </div>

      {/* 總覽卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">投資總額</p>
          <p className="text-xl font-bold">{fmtNum(portfolio.total_investment)}</p>
          <p className="text-xs text-gray-400">{ccy}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">期末市值</p>
          <p className="text-xl font-bold">{fmtNum(portfolio.total_market_value)}</p>
          <p className="text-xs text-gray-400">{ccy}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">未實現損益</p>
          <p className={`text-xl font-bold ${portfolio.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {portfolio.total_pnl >= 0 ? '+' : ''}{fmtNum(portfolio.total_pnl)}
          </p>
          <p className="text-xs text-gray-400">{fmtPct(portfolio.total_return_rate)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">整體 IRR</p>
          <p className="text-xl font-bold">{fmtPct(portfolio.irr)}</p>
          <p className="text-xs text-gray-400">年化</p>
        </div>
      </div>

      {/* 按策略分組的持倉表 */}
      {portfolio.holdings_by_strategy.map(group => (
        <div key={group.strategy} className="mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${
              group.strategy === '保守型' ? 'bg-blue-500' :
              group.strategy === '平衡型' ? 'bg-yellow-500' :
              'bg-red-500'
            }`} />
            {group.strategy}
          </h2>
          <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium">ISIN</th>
                  <th className="text-left px-3 py-2.5 font-medium">名稱</th>
                  <th className="text-right px-3 py-2.5 font-medium">平均成本</th>
                  <th className="text-right px-3 py-2.5 font-medium">持倉股數</th>
                  <th className="text-right px-3 py-2.5 font-medium">投資額({ccy})</th>
                  <th className="text-right px-3 py-2.5 font-medium">最新淨值</th>
                  <th className="text-right px-3 py-2.5 font-medium">市值({ccy})</th>
                  <th className="text-right px-3 py-2.5 font-medium">未實現損益</th>
                  <th className="text-right px-3 py-2.5 font-medium">已實現損益</th>
                  <th className="text-right px-3 py-2.5 font-medium">累計派息</th>
                  <th className="text-right px-3 py-2.5 font-medium">含息總收益</th>
                  <th className="text-right px-3 py-2.5 font-medium">含息回報率</th>
                  <th className="text-center px-3 py-2.5 font-medium">PRR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {group.holdings.map(h => (
                  <tr key={h.fund.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{h.fund.isin}</td>
                    <td className="px-3 py-2 text-xs">{h.fund.name_zh || h.fund.name_en || '-'}</td>
                    <td className="px-3 py-2 text-right">{fmtRaw(h.avg_cost)}</td>
                    <td className="px-3 py-2 text-right">{fmtRaw(h.shares, 2)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(h.investment_hkd)}</td>
                    <td className="px-3 py-2 text-right">{fmtRaw(h.latest_nav)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(h.market_value_hkd)}</td>
                    <td className={`px-3 py-2 text-right ${h.unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmtNum(h.unrealized_pnl)}
                    </td>
                    <td className={`px-3 py-2 text-right ${h.realized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmtNum(h.realized_pnl)}
                    </td>
                    <td className="px-3 py-2 text-right text-blue-600">
                      {fmtNum(h.total_dividends)}
                    </td>
                    <td className={`px-3 py-2 text-right font-medium ${h.total_return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {h.total_return >= 0 ? '+' : ''}{fmtNum(h.total_return)}
                    </td>
                    <td className={`px-3 py-2 text-right ${h.return_rate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmtPct(h.return_rate)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        h.prr_level <= 2 ? 'bg-green-100 text-green-700' :
                        h.prr_level <= 3 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {h.prr_level}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-medium">
                <tr>
                  <td className="px-3 py-2.5" colSpan={4}>{group.strategy}小計</td>
                  <td className="px-3 py-2.5 text-right">{fmtNum(group.subtotal_investment)}</td>
                  <td className="px-3 py-2.5"></td>
                  <td className="px-3 py-2.5 text-right">{fmtNum(group.subtotal_market_value)}</td>
                  <td className="px-3 py-2.5" colSpan={3}></td>
                  <td className={`px-3 py-2.5 text-right ${group.subtotal_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {group.subtotal_pnl >= 0 ? '+' : ''}{fmtNum(group.subtotal_pnl)}
                  </td>
                  <td className={`px-3 py-2.5 text-right ${group.subtotal_return_rate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {fmtPct(group.subtotal_return_rate)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}

      {/* 整體總計 */}
      <div className="bg-slate-800 text-white rounded-xl p-5 flex flex-wrap justify-between items-center gap-4">
        <span className="font-bold">整體總計</span>
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <span className="text-slate-400">投資額</span>
            <span className="ml-2 font-bold">{fmtNum(portfolio.total_investment)} {ccy}</span>
          </div>
          <div>
            <span className="text-slate-400">市值</span>
            <span className="ml-2 font-bold">{fmtNum(portfolio.total_market_value)} {ccy}</span>
          </div>
          <div>
            <span className="text-slate-400">損益</span>
            <span className={`ml-2 font-bold ${portfolio.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {portfolio.total_pnl >= 0 ? '+' : ''}{fmtNum(portfolio.total_pnl)} ({fmtPct(portfolio.total_return_rate)})
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
