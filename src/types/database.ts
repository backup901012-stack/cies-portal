// 資料庫型別定義

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'advisor'
  created_at: string
}

export interface Client {
  id: string
  advisor_id: string
  client_code: string
  name: string
  email?: string
  phone?: string
  notes?: string
  created_at: string
}

export interface Fund {
  id: string
  isin: string
  bloomberg_ticker?: string
  yahoo_ticker?: string
  name_en?: string
  name_zh?: string
  fund_type?: string
  investment_style?: string
  area?: string
  style?: string
  currency?: string
  cies_eligible: boolean
  dividend_frequency?: string
  nav_source: string
  created_at: string
  updated_at: string
}

export interface FundPrice {
  id: number
  fund_id: string
  price_date: string
  nav: number
  currency?: string
  source?: string
  created_at: string
}

export interface FundMonthlyReturn {
  id: number
  fund_id: string
  year_month: string
  return_rate: number
}

export interface Transaction {
  id: string
  client_id: string
  fund_id: string
  trade_date: string
  type: '買入' | '賣出' | '派息' | '管理費'
  nav?: number
  shares?: number
  dividend_amount?: number
  fee: number
  currency?: string
  total_amount?: number
  total_hkd?: number
  notes?: string
  created_at: string
  // 關聯
  fund?: Fund
}

export interface ExchangeRate {
  id: number
  base_currency: string
  quote_currency: string
  rate: number
  rate_date: string
  source?: string
}

// 計算用型別
export interface Holding {
  fund: Fund
  shares: number
  avg_cost: number
  investment_hkd: number
  allocation_pct: number
  total_pct: number
  latest_nav: number
  market_value_hkd: number
  unrealized_pnl: number
  realized_pnl: number
  total_dividends: number
  total_return: number
  return_rate: number
  prr_liquidity: number
  prr_region: number
  prr_asset: number
  prr_level: number
}

export interface PortfolioSummary {
  total_investment: number
  total_market_value: number
  total_pnl: number
  total_return_rate: number
  irr: number
  holdings_by_strategy: {
    strategy: string
    holdings: Holding[]
    subtotal_investment: number
    subtotal_market_value: number
    subtotal_pnl: number
    subtotal_return_rate: number
  }[]
}
