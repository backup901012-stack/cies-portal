import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CIES 客戶投資組合管理系統',
  description: '基金與股票持倉管理、IRR 計算、配置分析',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  )
}
