import { createServerSupabase } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  // 統計數據
  const [clientsRes, fundsRes, pricesRes, txRes] = await Promise.all([
    supabase.from('cies_clients').select('id, name, client_code', { count: 'exact' }),
    supabase.from('funds').select('id', { count: 'exact' }),
    supabase.from('fund_prices').select('id').eq('price_date', new Date().toISOString().split('T')[0]),
    supabase.from('transactions').select('total_hkd'),
  ])

  const clientCount = clientsRes.count || 0
  const fundCount = fundsRes.count || 0
  const todayPrices = pricesRes.data?.length || 0

  // 計算管理資產總額
  const totalAum = txRes.data?.reduce((sum, tx) => {
    const hkd = Number(tx.total_hkd) || 0
    return sum + Math.abs(hkd)
  }, 0) || 0

  function fmtNum(n: number): string {
    if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 億'
    if (n >= 1e4) return (n / 1e4).toFixed(0) + ' 萬'
    return n.toLocaleString()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">總覽</h1>

      {/* 統計卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Link href="/clients" className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">客戶總數</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{clientCount}</p>
          <p className="text-xs text-blue-500 mt-2">查看客戶列表 →</p>
        </Link>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-sm text-gray-500">累計交易額</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{fmtNum(totalAum)}</p>
          <p className="text-xs text-gray-400 mt-2">HKD</p>
        </div>
        <Link href="/funds" className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">基金數量</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{fundCount}</p>
          <p className="text-xs text-blue-500 mt-2">查看基金資料庫 →</p>
        </Link>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-sm text-gray-500">今日淨值更新</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{todayPrices}</p>
          <p className="text-xs text-gray-400 mt-2">檔基金</p>
        </div>
      </div>

      {/* 快捷操作 */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="font-bold text-gray-800 mb-4">快捷操作</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/clients/new" className="p-4 bg-blue-50 rounded-lg text-center hover:bg-blue-100 transition-colors">
            <span className="text-2xl block mb-1">👤</span>
            <span className="text-sm font-medium text-blue-700">新增客戶</span>
          </Link>
          <Link href="/funds/upload" className="p-4 bg-green-50 rounded-lg text-center hover:bg-green-100 transition-colors">
            <span className="text-2xl block mb-1">📤</span>
            <span className="text-sm font-medium text-green-700">上傳基金 CSV</span>
          </Link>
          <Link href="/funds" className="p-4 bg-purple-50 rounded-lg text-center hover:bg-purple-100 transition-colors">
            <span className="text-2xl block mb-1">💰</span>
            <span className="text-sm font-medium text-purple-700">基金資料庫</span>
          </Link>
          <Link href="/settings" className="p-4 bg-gray-50 rounded-lg text-center hover:bg-gray-100 transition-colors">
            <span className="text-2xl block mb-1">⚙️</span>
            <span className="text-sm font-medium text-gray-700">系統設定</span>
          </Link>
        </div>
      </div>

      {/* 最近客戶 */}
      {clientsRes.data && clientsRes.data.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-bold text-gray-800 mb-4">最近客戶</h2>
          <div className="space-y-2">
            {clientsRes.data.slice(0, 5).map((c: { id: string; name: string; client_code: string }) => (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div>
                  <span className="font-medium text-gray-900">{c.name}</span>
                  <span className="ml-2 text-sm font-mono text-gray-400">{c.client_code}</span>
                </div>
                <span className="text-blue-500 text-sm">查看持倉 →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 歡迎訊息 */}
      <div className="mt-6 text-center text-sm text-gray-400">
        歡迎，{user?.user_metadata?.name || user?.email} | CIES 客戶投資組合管理系統 v1.0
      </div>
    </div>
  )
}
