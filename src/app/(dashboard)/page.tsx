import { createServerSupabase } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        總覽
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="客戶總數" value="-" subtitle="位客戶" />
        <StatCard title="管理資產" value="-" subtitle="HKD" />
        <StatCard title="基金數量" value="-" subtitle="檔基金" />
        <StatCard title="今日更新" value="-" subtitle="檔淨值" />
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <p className="text-gray-500">
          歡迎，{user?.user_metadata?.name || user?.email}
        </p>
        <p className="text-sm text-gray-400 mt-2">
          系統建置中，功能將陸續上線。
        </p>
      </div>
    </div>
  )
}

function StatCard({ title, value, subtitle }: {
  title: string
  value: string
  subtitle: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
    </div>
  )
}
