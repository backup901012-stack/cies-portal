'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function ClientNav({ clientId, clientName, clientCode }: {
  clientId: string
  clientName: string
  clientCode: string
}) {
  const pathname = usePathname()
  const base = `/clients/${clientId}`

  const tabs = [
    { href: base, label: '持倉總覽', exact: true },
    { href: `${base}/transactions`, label: '交易記錄' },
    { href: `${base}/analysis`, label: '配置分析' },
    { href: `${base}/irr`, label: 'IRR 計算' },
    { href: `${base}/redeemed`, label: '已贖回' },
    { href: `${base}/report`, label: '報告下載' },
  ]

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/clients" className="text-gray-400 hover:text-gray-600 text-sm">← 客戶列表</Link>
        <h1 className="text-xl font-bold text-gray-900">{clientName}</h1>
        <span className="text-sm font-mono text-gray-400">{clientCode}</span>
      </div>
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(tab => {
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
