'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calculatePortfolio } from '@/lib/holdings'
import type { Fund, PortfolioSummary } from '@/types/database'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const STRATEGY_COLORS: Record<string, string> = {
  '保守型': '#3b82f6',
  '平衡型': '#f59e0b',
  '進取型': '#ef4444',
}

const AREA_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
const STYLE_COLORS = ['#6366f1', '#14b8a6', '#f97316', '#e11d48', '#8b5cf6', '#0ea5e9', '#84cc16']

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>()
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const { data: txData } = await supabase
      .from('transactions')
      .select('*, fund:funds(*)')
      .eq('client_id', id)
      .order('trade_date')

    if (!txData?.length) { setLoading(false); return }

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

    setPortfolio(calculatePortfolio(txData, fundsMap, navsMap, ratesMap))
    setLoading(false)
  }

  if (loading) return <p className="text-gray-400 py-8 text-center">載入中...</p>
  if (!portfolio) return <p className="text-gray-400 py-8 text-center">尚無交易記錄</p>

  // 策略配置數據
  const strategyData = portfolio.holdings_by_strategy.map(g => ({
    name: g.strategy,
    value: g.subtotal_market_value,
    investment: g.subtotal_investment,
    pnl: g.subtotal_pnl,
    rate: g.subtotal_return_rate,
  }))

  // 區域配置數據
  const areaMap = new Map<string, { value: number; investment: number }>()
  for (const g of portfolio.holdings_by_strategy) {
    for (const h of g.holdings) {
      const area = h.fund.area || '其他'
      const prev = areaMap.get(area) || { value: 0, investment: 0 }
      areaMap.set(area, { value: prev.value + h.market_value_hkd, investment: prev.investment + h.investment_hkd })
    }
  }
  const areaData = [...areaMap.entries()]
    .map(([name, v]) => ({ name, value: v.value, investment: v.investment, pnl: v.value - v.investment }))
    .sort((a, b) => b.value - a.value)

  // 風格配置數據
  const styleMap = new Map<string, { value: number; investment: number }>()
  for (const g of portfolio.holdings_by_strategy) {
    for (const h of g.holdings) {
      const style = h.fund.style || '其他'
      const prev = styleMap.get(style) || { value: 0, investment: 0 }
      styleMap.set(style, { value: prev.value + h.market_value_hkd, investment: prev.investment + h.investment_hkd })
    }
  }
  const styleData = [...styleMap.entries()]
    .map(([name, v]) => ({ name, value: v.value, investment: v.investment, pnl: v.value - v.investment }))
    .sort((a, b) => b.value - a.value)

  // 各基金盈虧率柱狀圖
  const pnlData = portfolio.holdings_by_strategy
    .flatMap(g => g.holdings)
    .map(h => ({
      name: (h.fund.name_zh || h.fund.isin || '').slice(0, 12),
      rate: +(h.return_rate * 100).toFixed(2),
      strategy: h.fund.investment_style || '其他',
    }))
    .sort((a, b) => b.rate - a.rate)

  function fmtNum(n: number): string {
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M'
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + 'K'
    return n.toFixed(0)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderLabel = (props: any) => {
    const { name, percent } = props
    return `${name || ''} ${((percent || 0) * 100).toFixed(1)}%`
  }

  return (
    <div className="space-y-6">
      {/* 三個圓餅圖 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 策略配置 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="font-bold text-gray-800 mb-3">策略配置</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={strategyData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                outerRadius={90} label={renderLabel} labelLine={true}>
                {strategyData.map((entry) => (
                  <Cell key={entry.name} fill={STRATEGY_COLORS[entry.name] || '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${fmtNum(Number(value))} HKD`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {strategyData.map(d => (
              <div key={d.name} className="flex justify-between text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: STRATEGY_COLORS[d.name] }} />
                  {d.name}
                </span>
                <span className={d.pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {d.pnl >= 0 ? '+' : ''}{(d.rate * 100).toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 區域分佈 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="font-bold text-gray-800 mb-3">區域分佈</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={areaData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                outerRadius={90} label={renderLabel} labelLine={true}>
                {areaData.map((_, i) => (
                  <Cell key={i} fill={AREA_COLORS[i % AREA_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${fmtNum(Number(value))} HKD`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {areaData.map((d, i) => (
              <div key={d.name} className="flex justify-between text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: AREA_COLORS[i % AREA_COLORS.length] }} />
                  {d.name}
                </span>
                <span>{fmtNum(d.value)} HKD</span>
              </div>
            ))}
          </div>
        </div>

        {/* 風格分佈 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="font-bold text-gray-800 mb-3">風格分佈</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={styleData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                outerRadius={90} label={renderLabel} labelLine={true}>
                {styleData.map((_, i) => (
                  <Cell key={i} fill={STYLE_COLORS[i % STYLE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${fmtNum(Number(value))} HKD`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {styleData.map((d, i) => (
              <div key={d.name} className="flex justify-between text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: STYLE_COLORS[i % STYLE_COLORS.length] }} />
                  {d.name}
                </span>
                <span>{fmtNum(d.value)} HKD</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 盈虧率柱狀圖 */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h3 className="font-bold text-gray-800 mb-3">各基金盈虧率比較</h3>
        <ResponsiveContainer width="100%" height={Math.max(300, pnlData.length * 35)}>
          <BarChart data={pnlData} layout="vertical" margin={{ left: 100, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={v => `${v}%`} />
            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => `${value}%`} />
            <Bar dataKey="rate" name="盈虧率">
              {pnlData.map((entry, i) => (
                <Cell key={i} fill={entry.rate >= 0 ? '#10b981' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 配置對比表格 */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h3 className="font-bold text-gray-800 mb-3">配置與盈虧對比</h3>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium">策略</th>
              <th className="text-right px-3 py-2 font-medium">初始配置(HKD)</th>
              <th className="text-right px-3 py-2 font-medium">含息市值(HKD)</th>
              <th className="text-right px-3 py-2 font-medium">盈虧</th>
              <th className="text-right px-3 py-2 font-medium">盈虧率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {strategyData.map(d => (
              <tr key={d.name}>
                <td className="px-3 py-2 font-medium">{d.name}</td>
                <td className="px-3 py-2 text-right">{fmtNum(d.investment)}</td>
                <td className="px-3 py-2 text-right">{fmtNum(d.value)}</td>
                <td className={`px-3 py-2 text-right ${d.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {d.pnl >= 0 ? '+' : ''}{fmtNum(d.pnl)}
                </td>
                <td className={`px-3 py-2 text-right ${d.rate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {(d.rate * 100).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-bold">
            <tr>
              <td className="px-3 py-2">總計</td>
              <td className="px-3 py-2 text-right">{fmtNum(portfolio.total_investment)}</td>
              <td className="px-3 py-2 text-right">{fmtNum(portfolio.total_market_value)}</td>
              <td className={`px-3 py-2 text-right ${portfolio.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {portfolio.total_pnl >= 0 ? '+' : ''}{fmtNum(portfolio.total_pnl)}
              </td>
              <td className={`px-3 py-2 text-right ${portfolio.total_return_rate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(portfolio.total_return_rate * 100).toFixed(2)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
