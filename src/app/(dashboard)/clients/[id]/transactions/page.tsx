'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Transaction, Fund } from '@/types/database'

export default function TransactionsPage() {
  const { id } = useParams<{ id: string }>()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [funds, setFunds] = useState<Fund[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    fund_isin: '',
    trade_date: new Date().toISOString().split('T')[0],
    type: '買入' as '買入' | '賣出' | '派息' | '管理費',
    nav: '',
    shares: '',
    dividend_amount: '',
    fee: '',
    notes: '',
  })
  const [searchFund, setSearchFund] = useState('')
  const [selectedFund, setSelectedFund] = useState<Fund | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [id])

  async function loadData() {
    const [txRes, fundsRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*, fund:funds(*)')
        .eq('client_id', id)
        .order('trade_date', { ascending: false }),
      supabase
        .from('funds')
        .select('*')
        .order('name_zh'),
    ])
    setTransactions(txRes.data || [])
    setFunds(fundsRes.data || [])
    setLoading(false)
  }

  const filteredFunds = searchFund.length >= 2
    ? funds.filter(f =>
        f.isin.toLowerCase().includes(searchFund.toLowerCase()) ||
        f.name_zh?.toLowerCase().includes(searchFund.toLowerCase()) ||
        f.name_en?.toLowerCase().includes(searchFund.toLowerCase())
      ).slice(0, 10)
    : []

  function selectFund(fund: Fund) {
    setSelectedFund(fund)
    setForm({ ...form, fund_isin: fund.isin })
    setSearchFund('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedFund) {
      setError('請選擇基金')
      return
    }
    setSaving(true)
    setError('')

    const nav = parseFloat(form.nav) || 0
    const shares = parseFloat(form.shares) || 0
    const fee = parseFloat(form.fee) || 0
    const dividendAmount = parseFloat(form.dividend_amount) || 0

    let totalAmount = 0
    if (form.type === '買入') {
      totalAmount = -(nav * shares + fee)
    } else if (form.type === '賣出') {
      totalAmount = nav * shares - fee
    } else if (form.type === '派息') {
      totalAmount = dividendAmount
    } else if (form.type === '管理費') {
      totalAmount = -fee
    }

    // 取當日匯率
    const currency = selectedFund.currency || 'HKD'
    let hkdRate = 1
    if (currency !== 'HKD') {
      const { data: rateData } = await supabase
        .from('exchange_rates')
        .select('rate')
        .eq('base_currency', currency)
        .eq('quote_currency', 'HKD')
        .order('rate_date', { ascending: false })
        .limit(1)
      if (rateData?.[0]) hkdRate = Number(rateData[0].rate)
      else if (currency === 'USD') hkdRate = 7.82
    }

    const { error: insertError } = await supabase.from('transactions').insert({
      client_id: id,
      fund_id: selectedFund.id,
      trade_date: form.trade_date,
      type: form.type,
      nav: nav || null,
      shares: shares || null,
      dividend_amount: dividendAmount || null,
      fee,
      currency,
      total_amount: totalAmount,
      total_hkd: totalAmount * hkdRate,
      notes: form.notes || null,
    })

    if (insertError) {
      setError(insertError.message)
    } else {
      // 同時記錄淨值到 fund_prices
      if (nav > 0) {
        await supabase.from('fund_prices').upsert({
          fund_id: selectedFund.id,
          price_date: form.trade_date,
          nav,
          currency,
          source: 'manual',
        }, { onConflict: 'fund_id,price_date' })
      }

      setShowForm(false)
      setSelectedFund(null)
      setForm({
        fund_isin: '', trade_date: new Date().toISOString().split('T')[0],
        type: '買入', nav: '', shares: '', dividend_amount: '', fee: '', notes: '',
      })
      loadData()
    }
    setSaving(false)
  }

  function fmtNum(n: number): string {
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">交易記錄</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          {showForm ? '取消' : '+ 新增交易'}
        </button>
      </div>

      {/* 新增交易表單 */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-5 mb-6 space-y-4">
          {/* 選擇基金 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">選擇基金 *</label>
            {selectedFund ? (
              <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                <span className="text-sm font-mono">{selectedFund.isin}</span>
                <span className="text-sm">{selectedFund.name_zh}</span>
                <span className="text-xs text-gray-400">{selectedFund.currency}</span>
                <button type="button" onClick={() => setSelectedFund(null)} className="ml-auto text-red-500 text-sm">
                  移除
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={searchFund}
                  onChange={(e) => setSearchFund(e.target.value)}
                  placeholder="輸入 ISIN 或名稱搜尋..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {filteredFunds.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg mt-1 shadow-lg max-h-60 overflow-y-auto">
                    {filteredFunds.map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => selectFund(f)}
                        className="w-full px-3 py-2 text-left hover:bg-blue-50 text-sm flex items-center gap-2"
                      >
                        <span className="font-mono text-xs text-gray-500">{f.isin}</span>
                        <span>{f.name_zh || f.name_en}</span>
                        <span className="text-xs text-gray-400 ml-auto">{f.currency} | {f.investment_style}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 7 個手動欄位 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">日期 *</label>
              <input
                type="date"
                value={form.trade_date}
                onChange={(e) => setForm({ ...form, trade_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">科目 *</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="買入">買入</option>
                <option value="賣出">賣出</option>
                <option value="派息">派息</option>
                <option value="管理費">管理費</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">交易淨值</label>
              <input
                type="number"
                step="any"
                value={form.nav}
                onChange={(e) => setForm({ ...form, nav: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">交易股數</label>
              <input
                type="number"
                step="any"
                value={form.shares}
                onChange={(e) => setForm({ ...form, shares: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">派息金額</label>
              <input
                type="number"
                step="any"
                value={form.dividend_amount}
                onChange={(e) => setForm({ ...form, dividend_amount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">手續費</label>
              <input
                type="number"
                step="any"
                value={form.fee}
                onChange={(e) => setForm({ ...form, fee: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? '儲存中...' : '儲存交易'}
          </button>
        </form>
      )}

      {/* 交易列表 */}
      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium">日期</th>
              <th className="text-left px-3 py-2.5 font-medium">科目</th>
              <th className="text-left px-3 py-2.5 font-medium">ISIN</th>
              <th className="text-left px-3 py-2.5 font-medium">名稱</th>
              <th className="text-right px-3 py-2.5 font-medium">淨值</th>
              <th className="text-right px-3 py-2.5 font-medium">股數</th>
              <th className="text-right px-3 py-2.5 font-medium">派息</th>
              <th className="text-right px-3 py-2.5 font-medium">手續費</th>
              <th className="text-right px-3 py-2.5 font-medium">總額(HKD)</th>
              <th className="text-left px-3 py-2.5 font-medium">備註</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">載入中...</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">尚無交易記錄</td></tr>
            ) : transactions.map(tx => (
              <tr key={tx.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">{tx.trade_date}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    tx.type === '買入' ? 'bg-green-100 text-green-700' :
                    tx.type === '賣出' ? 'bg-red-100 text-red-700' :
                    tx.type === '派息' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {tx.type}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{tx.fund?.isin || '-'}</td>
                <td className="px-3 py-2 text-xs">{tx.fund?.name_zh || '-'}</td>
                <td className="px-3 py-2 text-right">{tx.nav ? fmtNum(tx.nav) : '-'}</td>
                <td className="px-3 py-2 text-right">{tx.shares ? fmtNum(tx.shares) : '-'}</td>
                <td className="px-3 py-2 text-right">{tx.dividend_amount ? fmtNum(tx.dividend_amount) : '-'}</td>
                <td className="px-3 py-2 text-right">{tx.fee ? fmtNum(tx.fee) : '-'}</td>
                <td className="px-3 py-2 text-right font-medium">{tx.total_hkd ? fmtNum(tx.total_hkd) : '-'}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{tx.notes || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
