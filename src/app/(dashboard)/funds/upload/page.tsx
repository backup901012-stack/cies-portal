'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { importCsvToDatabase } from '@/lib/csv-import'
import Link from 'next/link'

export default function FundsUploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    fundsCount: number
    returnsCount: number
    errors: string[]
  } | null>(null)

  async function handleUpload() {
    if (!file) return
    setLoading(true)
    setResult(null)

    try {
      const text = await file.text()
      const supabase = createClient()
      const res = await importCsvToDatabase(text, supabase)
      setResult(res)
    } catch (err) {
      setResult({
        fundsCount: 0,
        returnsCount: 0,
        errors: [`上傳失敗: ${err instanceof Error ? err.message : '未知錯誤'}`],
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/funds" className="text-gray-400 hover:text-gray-600">
          ← 返回基金資料庫
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">上傳基金 CSV</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 max-w-xl">
        <p className="text-sm text-gray-500 mb-4">
          上傳 ALL_MF__YYYYMMDD.csv 檔案，系統會自動匯入基金資料與月度回報率。
          若 ISIN 已存在會自動更新。
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              選擇 CSV 檔案
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {loading ? '匯入中...' : '開始匯入'}
          </button>
        </div>

        {result && (
          <div className={`mt-6 p-4 rounded-lg ${result.errors.length > 0 ? 'bg-yellow-50' : 'bg-green-50'}`}>
            <p className="font-medium text-gray-900">匯入完成</p>
            <ul className="mt-2 text-sm space-y-1">
              <li className="text-green-700">基金資料: {result.fundsCount} 筆</li>
              <li className="text-green-700">月度回報: {result.returnsCount} 筆</li>
            </ul>
            {result.errors.length > 0 && (
              <div className="mt-3">
                <p className="text-yellow-700 font-medium text-sm">警告:</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-yellow-600 text-xs mt-1">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
