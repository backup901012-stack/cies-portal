'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calculatePortfolio } from '@/lib/holdings'
import type { Fund, PortfolioSummary, Client } from '@/types/database'
import jsPDF from 'jspdf'
import * as XLSX from 'xlsx'

export default function ReportPage() {
  const { id } = useParams<{ id: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState('')
  const supabase = createClient()

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const { data: clientData } = await supabase.from('cies_clients').select('*').eq('id', id).single()
    setClient(clientData)

    const { data: txData } = await supabase
      .from('transactions').select('*, fund:funds(*)').eq('client_id', id).order('trade_date')

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

  function fmtNum(n: number): string {
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  async function generatePDF() {
    if (!portfolio || !client) return
    setGenerating('pdf')

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const today = new Date().toISOString().split('T')[0]

    // 封面
    doc.setFillColor(30, 41, 59)
    doc.rect(0, 0, 297, 210, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(28)
    doc.text('CIES Investment Portfolio Report', 148.5, 70, { align: 'center' })
    doc.setFontSize(16)
    doc.text(`${client.client_code} ${client.name}`, 148.5, 90, { align: 'center' })
    doc.setFontSize(12)
    doc.text(`Report Date: ${today}`, 148.5, 110, { align: 'center' })

    // 持倉總覽
    doc.addPage()
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(18)
    doc.text('Portfolio Summary', 15, 20)

    doc.setFontSize(11)
    const summaryY = 35
    doc.text(`Total Investment: HKD ${fmtNum(portfolio.total_investment)}`, 15, summaryY)
    doc.text(`Market Value: HKD ${fmtNum(portfolio.total_market_value)}`, 15, summaryY + 8)
    doc.text(`Unrealized P&L: HKD ${fmtNum(portfolio.total_pnl)} (${(portfolio.total_return_rate * 100).toFixed(2)}%)`, 15, summaryY + 16)

    // 按策略列出持倉
    let y = summaryY + 30
    for (const group of portfolio.holdings_by_strategy) {
      if (y > 180) { doc.addPage(); y = 20 }

      doc.setFontSize(13)
      doc.setTextColor(30, 41, 59)
      doc.text(group.strategy, 15, y)
      y += 8

      // 表頭
      doc.setFontSize(8)
      doc.setTextColor(100, 100, 100)
      const cols = [15, 45, 95, 125, 155, 185, 215, 250]
      const headers = ['ISIN', 'Fund Name', 'Avg Cost', 'Shares', 'Invest(HKD)', 'MV(HKD)', 'P&L(HKD)', 'Return']
      headers.forEach((h, i) => doc.text(h, cols[i], y))
      y += 2
      doc.setDrawColor(200, 200, 200)
      doc.line(15, y, 280, y)
      y += 4

      doc.setTextColor(0, 0, 0)
      for (const h of group.holdings) {
        if (y > 190) { doc.addPage(); y = 20 }
        doc.text(h.fund.isin, cols[0], y)
        doc.text((h.fund.name_zh || h.fund.name_en || '-').slice(0, 20), cols[1], y)
        doc.text(h.avg_cost.toFixed(4), cols[2], y)
        doc.text(h.shares.toFixed(2), cols[3], y)
        doc.text(fmtNum(h.investment_hkd), cols[4], y)
        doc.text(fmtNum(h.market_value_hkd), cols[5], y)
        doc.text(fmtNum(h.total_return), cols[6], y)
        doc.text((h.return_rate * 100).toFixed(2) + '%', cols[7], y)
        y += 5
      }

      // 小計
      y += 2
      doc.setFontSize(9)
      doc.setTextColor(30, 41, 59)
      doc.text(`Subtotal: Invest ${fmtNum(group.subtotal_investment)} | MV ${fmtNum(group.subtotal_market_value)} | P&L ${fmtNum(group.subtotal_pnl)} (${(group.subtotal_return_rate * 100).toFixed(2)}%)`, 15, y)
      y += 10
    }

    doc.save(`CIES_Report_${client.client_code}_${today}.pdf`)
    setGenerating('')
  }

  async function generateExcel() {
    if (!portfolio || !client) return
    setGenerating('excel')

    const today = new Date().toISOString().split('T')[0]
    const wb = XLSX.utils.book_new()

    // Sheet 1: 持倉配置表
    const holdingsData: Record<string, unknown>[] = []
    for (const group of portfolio.holdings_by_strategy) {
      for (const h of group.holdings) {
        holdingsData.push({
          'ISIN CODE': h.fund.isin,
          '資產名稱': h.fund.name_zh || h.fund.name_en || '',
          '區域': h.fund.area || '',
          '風格': h.fund.style || '',
          '策略': h.fund.investment_style || '',
          '加權平均成本': h.avg_cost,
          '持倉股數': h.shares,
          '投資金額(HKD)': h.investment_hkd,
          '配置比例': h.allocation_pct,
          '總比例': h.total_pct,
          '最新淨值': h.latest_nav,
          '最新市值(HKD)': h.market_value_hkd,
          '未實現損益(HKD)': h.unrealized_pnl,
          '已實現損益(HKD)': h.realized_pnl,
          '累計派息(HKD)': h.total_dividends,
          '含息總收益(HKD)': h.total_return,
          '含息回報率': h.return_rate,
          'PRR等級': h.prr_level,
        })
      }
    }
    const ws1 = XLSX.utils.json_to_sheet(holdingsData)
    XLSX.utils.book_append_sheet(wb, ws1, '持倉比例配置表')

    // Sheet 2: 策略圓餅圖數據
    const strategyData = portfolio.holdings_by_strategy.map(g => ({
      '策略': g.strategy,
      '初始配置(HKD)': g.subtotal_investment,
      '含息市值(HKD)': g.subtotal_market_value,
      '盈虧': g.subtotal_pnl,
      '盈虧率': g.subtotal_return_rate,
    }))
    strategyData.push({
      '策略': '總計',
      '初始配置(HKD)': portfolio.total_investment,
      '含息市值(HKD)': portfolio.total_market_value,
      '盈虧': portfolio.total_pnl,
      '盈虧率': portfolio.total_return_rate,
    })
    const ws2 = XLSX.utils.json_to_sheet(strategyData)
    XLSX.utils.book_append_sheet(wb, ws2, '策略配置')

    // Sheet 3: 交易記錄
    const { data: txData } = await supabase
      .from('transactions').select('*, fund:funds(*)').eq('client_id', id).order('trade_date', { ascending: false })

    if (txData?.length) {
      const txSheet = txData.map(tx => ({
        '日期': tx.trade_date,
        '科目': tx.type,
        'ISIN': tx.fund?.isin || '',
        '資產名稱': tx.fund?.name_zh || '',
        '交易淨值': tx.nav,
        '交易股數': tx.shares,
        '派息金額': tx.dividend_amount,
        '手續費': tx.fee,
        '幣種': tx.currency,
        '總金額(原幣)': tx.total_amount,
        '等同港幣(HKD)': tx.total_hkd,
        '備註': tx.notes || '',
      }))
      const ws3 = XLSX.utils.json_to_sheet(txSheet)
      XLSX.utils.book_append_sheet(wb, ws3, '現金流')
    }

    XLSX.writeFile(wb, `CIES_Report_${client.client_code}_${today}.xlsx`)
    setGenerating('')
  }

  if (loading) return <p className="text-gray-400 py-8 text-center">載入中...</p>

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-800 mb-4">報告下載</h2>

      {!portfolio ? (
        <p className="text-gray-400 py-8 text-center">尚無交易記錄，無法生成報告</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
          {/* PDF 報告 */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📄</span>
              </div>
              <h3 className="font-bold text-gray-900">PDF 報告</h3>
              <p className="text-sm text-gray-500 mt-1">
                持倉總覽、損益分析、配置比例
              </p>
              <button
                onClick={generatePDF}
                disabled={generating === 'pdf'}
                className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
              >
                {generating === 'pdf' ? '生成中...' : '下載 PDF'}
              </button>
            </div>
          </div>

          {/* Excel 報告 */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📊</span>
              </div>
              <h3 className="font-bold text-gray-900">Excel 報告</h3>
              <p className="text-sm text-gray-500 mt-1">
                完整數據：持倉配置、策略分析、現金流
              </p>
              <button
                onClick={generateExcel}
                disabled={generating === 'excel'}
                className="mt-4 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
              >
                {generating === 'excel' ? '生成中...' : '下載 Excel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
