'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // 自動補上 @cies.com，讓使用者只需輸入帳號
    const loginEmail = email.includes('@') ? email : `${email}@cies.com`

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">CIES 投資組合管理</h1>
          <p className="text-gray-500 mt-2">登入您的帳號</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              帳號
            </label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="例如：cbe566"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-400 mt-1">輸入帳號即可，系統自動補上 @cies.com</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              密碼
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {loading ? '登入中...' : '登入'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          還沒有帳號？{' '}
          <Link href="/register" className="text-blue-600 hover:underline">
            註冊
          </Link>
        </p>
      </div>
    </div>
  )
}
