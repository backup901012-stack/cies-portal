'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import type { Client } from '@/types/database'

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const supabase = createClient()

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    const { data } = await supabase
      .from('cies_clients')
      .select('*')
      .order('created_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  const filtered = clients.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q)
      || c.client_code.toLowerCase().includes(q)
      || c.email?.toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">客戶管理</h1>
        <Link
          href="/clients/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          + 新增客戶
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <input
          type="text"
          placeholder="搜尋客戶編號 / 姓名 / 郵件..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <p className="text-gray-400 col-span-3 text-center py-8">載入中...</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 col-span-3 text-center py-8">
            {clients.length === 0 ? '尚無客戶，點擊右上角新增' : '沒有符合條件的客戶'}
          </p>
        ) : filtered.map(client => (
          <Link
            key={client.id}
            href={`/clients/${client.id}`}
            className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-gray-900">{client.name}</p>
                <p className="text-sm text-gray-500 mt-1 font-mono">{client.client_code}</p>
              </div>
            </div>
            {client.email && (
              <p className="text-xs text-gray-400 mt-3">{client.email}</p>
            )}
            {client.phone && (
              <p className="text-xs text-gray-400">{client.phone}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
