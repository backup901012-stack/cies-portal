'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import type { Fund } from '@/types/database'

export default function FundsPage() {
  const [funds, setFunds] = useState<Fund[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStyle, setFilterStyle] = useState('')
  const [filterArea, setFilterArea] = useState('')
  const [filterAsset, setFilterAsset] = useState('')
  const supabase = createClient()

  useEffect(() => {
    loadFunds()
  }, [])

  async function loadFunds() {
    const { data } = await supabase
      .from('funds')
      .select('*')
      .order('investment_style')
      .order('name_zh')
    setFunds(data || [])
    setLoading(false)
  }

  const filtered = funds.filter((f) => {
    if (search && !f.isin.toLowerCase().includes(search.toLowerCase())
      && !f.name_zh?.toLowerCase().includes(search.toLowerCase())
      && !f.name_en?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterStyle && f.investment_style !== filterStyle) return false
    if (filterArea && f.area !== filterArea) return false
    if (filterAsset && f.style !== filterAsset) return false
    return true
  })

  const styles = [...new Set(funds.map(f => f.investment_style).filter(Boolean))]
  const areas = [...new Set(funds.map(f => f.area).filter(Boolean))].sort()
  const assets = [...new Set(funds.map(f => f.style).filter(Boolean))].sort()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">基金資料庫</h1>
        <Link
          href="/funds/upload"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          上傳 CSV
        </Link>
      </div>

      {/* 篩選列 */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="搜尋 ISIN / 名稱..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm flex-1 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filterStyle}
          onChange={(e) => setFilterStyle(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">全部策略</option>
          {styles.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterArea}
          onChange={(e) => setFilterArea(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">全部區域</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={filterAsset}
          onChange={(e) => setFilterAsset(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">全部風格</option>
          {assets.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* 統計 */}
      <p className="text-sm text-gray-500 mb-3">
        共 {funds.length} 檔基金，顯示 {filtered.length} 檔
      </p>

      {/* 表格 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">ISIN</th>
                <th className="text-left px-4 py-3 font-medium">名稱</th>
                <th className="text-left px-4 py-3 font-medium">策略</th>
                <th className="text-left px-4 py-3 font-medium">區域</th>
                <th className="text-left px-4 py-3 font-medium">風格</th>
                <th className="text-left px-4 py-3 font-medium">幣種</th>
                <th className="text-left px-4 py-3 font-medium">派息</th>
                <th className="text-center px-4 py-3 font-medium">CIES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">載入中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  {funds.length === 0 ? '尚無基金資料，請先上傳 CSV' : '沒有符合條件的基金'}
                </td></tr>
              ) : filtered.slice(0, 100).map((f) => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs">{f.isin}</td>
                  <td className="px-4 py-2.5">{f.name_zh || f.name_en || '-'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      f.investment_style === '保守型' ? 'bg-blue-100 text-blue-700' :
                      f.investment_style === '平衡型' ? 'bg-yellow-100 text-yellow-700' :
                      f.investment_style === '進取型' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {f.investment_style || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{f.area || '-'}</td>
                  <td className="px-4 py-2.5">{f.style || '-'}</td>
                  <td className="px-4 py-2.5">{f.currency || '-'}</td>
                  <td className="px-4 py-2.5 text-xs">{f.dividend_frequency || '-'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {f.cies_eligible ? '✓' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 100 && (
          <p className="text-center text-sm text-gray-400 py-3">
            顯示前 100 筆，共 {filtered.length} 筆
          </p>
        )}
      </div>
    </div>
  )
}
