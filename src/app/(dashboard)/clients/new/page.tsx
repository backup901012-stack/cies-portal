'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { parseClientInfo, importExcelToDatabase } from '@/lib/excel-import'

export default function NewClientPage() {
  const [mode, setMode] = useState<'choose' | 'manual' | 'excel'>('choose')
  const [form, setForm] = useState({
    client_code: '',
    name: '',
    email: '',
    phone: '',
    notes: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [excelFile, setExcelFile] = useState<ArrayBuffer | null>(null)
  const [excelFileName, setExcelFileName] = useState('')
  const [importStatus, setImportStatus] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  // Excel 上傳後自動解析客戶資訊
  async function handleExcelSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    setExcelFileName(file.name)
    const buffer = await file.arrayBuffer()
    setExcelFile(buffer)

    // 自動解析客戶編號和姓名
    const clientInfo = parseClientInfo(buffer)
    if (clientInfo) {
      setForm(prev => ({
        ...prev,
        client_code: clientInfo.client_code,
        name: clientInfo.name,
      }))
    } else {
      setError('無法自動識別客戶資訊，請手動填寫客戶編號和姓名')
    }
  }

  // 手動建立客戶
  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('未登入'); setLoading(false); return }

    const { error: insertError } = await supabase.from('cies_clients').insert({
      advisor_id: user.id,
      client_code: form.client_code,
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      notes: form.notes || null,
    })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
    } else {
      router.push('/clients')
    }
  }

  // Excel 上傳：建立客戶 + 匯入交易
  async function handleExcelSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!excelFile) { setError('請先上傳 Excel 檔案'); return }
    if (!form.client_code || !form.name) { setError('請確認客戶編號和姓名'); return }

    setLoading(true)
    setError('')
    setImportStatus('建立客戶中...')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('未登入'); setLoading(false); return }

    // 檢查客戶是否已存在
    const { data: existing } = await supabase
      .from('cies_clients')
      .select('id')
      .eq('client_code', form.client_code)
      .limit(1)

    let clientId: string

    if (existing && existing.length > 0) {
      // 客戶已存在，直接用
      clientId = existing[0].id
      setImportStatus('客戶已存在，匯入交易中...')
    } else {
      // 建立新客戶
      const { data: newClient, error: insertError } = await supabase
        .from('cies_clients')
        .insert({
          advisor_id: user.id,
          client_code: form.client_code,
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          notes: form.notes || null,
        })
        .select('id')
        .single()

      if (insertError || !newClient) {
        setError(insertError?.message || '建立客戶失敗')
        setLoading(false)
        return
      }
      clientId = newClient.id
    }

    // 匯入交易
    setImportStatus('解析 Excel 並匯入交易...')
    const result = await importExcelToDatabase(excelFile, clientId, supabase)

    if (result.errors.length > 0 && result.transactionsCreated === 0) {
      setError(`匯入失敗：${result.errors.join('；')}`)
      setLoading(false)
      return
    }

    setImportStatus(
      `完成！${result.transactionsCreated} 筆交易、${result.fundsCreated} 檔新基金` +
      (result.errors.length > 0 ? `（${result.errors.length} 個警告）` : '')
    )

    // 跳轉到客戶詳情頁
    setTimeout(() => router.push(`/clients/${clientId}`), 1500)
  }

  // 選擇模式頁面
  if (mode === 'choose') {
    return (
      <div>
        <div className="flex items-center gap-4 mb-6">
          <Link href="/clients" className="text-gray-400 hover:text-gray-600">← 返回</Link>
          <h1 className="text-2xl font-bold text-gray-900">新增客戶</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
          {/* Excel 匯入 */}
          <button
            onClick={() => setMode('excel')}
            className="bg-white rounded-xl shadow-sm p-8 text-left hover:shadow-md hover:border-blue-500 border-2 border-transparent transition-all"
          >
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">📊</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Excel 匯入</h3>
            <p className="text-sm text-gray-500">
              上傳 CIES 標準 Excel 檔案，自動抓取客戶資訊和所有交易記錄
            </p>
            <span className="inline-block mt-3 text-xs bg-green-100 text-green-700 px-2 py-1 rounded">推薦</span>
          </button>

          {/* 手動輸入 */}
          <button
            onClick={() => setMode('manual')}
            className="bg-white rounded-xl shadow-sm p-8 text-left hover:shadow-md hover:border-blue-500 border-2 border-transparent transition-all"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">✏️</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">手動輸入</h3>
            <p className="text-sm text-gray-500">
              手動填寫客戶基本資料，之後再到交易記錄頁面逐筆新增
            </p>
          </button>
        </div>
      </div>
    )
  }

  // 手動輸入模式
  if (mode === 'manual') {
    return (
      <div>
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setMode('choose')} className="text-gray-400 hover:text-gray-600">← 返回</button>
          <h1 className="text-2xl font-bold text-gray-900">手動新增客戶</h1>
        </div>

        <form onSubmit={handleManualSubmit} className="bg-white rounded-xl shadow-sm p-6 max-w-lg space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">客戶編號 *</label>
            <input type="text" value={form.client_code} onChange={(e) => setForm({ ...form, client_code: e.target.value })}
              placeholder="例: P005812NC" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">電子郵件</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">電話</label>
            <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
            {loading ? '建立中...' : '建立客戶'}
          </button>
        </form>
      </div>
    )
  }

  // Excel 匯入模式
  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => setMode('choose')} className="text-gray-400 hover:text-gray-600">← 返回</button>
        <h1 className="text-2xl font-bold text-gray-900">Excel 匯入客戶</h1>
      </div>

      <form onSubmit={handleExcelSubmit} className="bg-white rounded-xl shadow-sm p-6 max-w-lg space-y-5">
        {/* 上傳區域 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">上傳 CIES Excel 檔案 *</label>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelSelect} className="hidden" />

          {excelFile ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
              <span className="text-2xl">📊</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-800 truncate">{excelFileName}</p>
                <p className="text-xs text-green-600">已解析成功</p>
              </div>
              <button type="button" onClick={() => { setExcelFile(null); setExcelFileName(''); setForm({ client_code: '', name: '', email: '', phone: '', notes: '' }) }}
                className="text-red-500 text-sm hover:text-red-700">移除</button>
            </div>
          ) : (
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="w-full p-8 border-2 border-dashed border-gray-300 rounded-lg text-center hover:border-blue-400 hover:bg-blue-50 transition-colors">
              <span className="text-3xl block mb-2">📂</span>
              <span className="text-sm text-gray-600">點擊選擇 Excel 檔案</span>
              <span className="text-xs text-gray-400 block mt-1">支援 .xlsx / .xls</span>
            </button>
          )}
        </div>

        {/* 自動填入的客戶資訊（可修改） */}
        {excelFile && (
          <>
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">自動識別的客戶資訊：</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">客戶編號 *</label>
                  <input type="text" value={form.client_code} onChange={(e) => setForm({ ...form, client_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">姓名 *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">電子郵件</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">電話</label>
                <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
          </>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {importStatus && <p className="text-blue-600 text-sm font-medium">{importStatus}</p>}

        {excelFile && (
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
            {loading ? importStatus || '處理中...' : '建立客戶並匯入交易'}
          </button>
        )}
      </form>
    </div>
  )
}
