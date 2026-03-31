// 持倉計算引擎
import type { Transaction, Fund, Holding, PortfolioSummary } from '@/types/database'

// PRR 風險評分
function getPrrScores(fund: Fund): { liquidity: number; region: number; asset: number } {
  let liquidity = 1
  let region = 1
  let asset = 1

  // 流動性評分
  if (fund.fund_type === 'ETF') liquidity = 1
  else if (fund.fund_type === '公募基金') liquidity = 1
  else liquidity = 3

  // 地域評分
  const regionMap: Record<string, number> = {
    '全球': 2, '美國': 2, '歐洲': 2,
    '亞太地區': 2, '亞太': 2,
    '日本': 3, '中國': 3, '香港': 2,
    '印度': 4, '新興市場': 4,
    '東協': 4, '越南': 5,
  }
  region = regionMap[fund.area || ''] || 2

  // 資產類別評分
  const assetMap: Record<string, number> = {
    '貨幣基金': 1, '債券': 3, '混和型': 5,
    '股票': 5, 'REIT': 5, '商品': 5, '加密貨幣': 7,
  }
  asset = assetMap[fund.style || ''] || 3

  return { liquidity, region, asset }
}

function getPrrLevel(liquidity: number, region: number, asset: number): number {
  const avg = (liquidity + region + asset) / 3
  if (avg <= 1.5) return 1
  if (avg <= 2.5) return 2
  if (avg <= 3.5) return 3
  if (avg <= 4.5) return 4
  return 5
}

// 計算單一基金的持倉
function calculateHolding(
  fund: Fund,
  transactions: Transaction[],
  latestNav: number,
  hkdRate: number,
): Holding | null {
  let totalShares = 0
  let totalCostHkd = 0
  let realizedPnl = 0
  let totalDividends = 0

  for (const t of transactions) {
    if (t.type === '買入') {
      totalShares += t.shares || 0
      totalCostHkd += Math.abs(t.total_hkd || 0)
    } else if (t.type === '賣出') {
      const soldShares = Math.abs(t.shares || 0)
      const avgCost = totalShares > 0 ? totalCostHkd / totalShares : 0
      realizedPnl += (t.total_hkd || 0) - avgCost * soldShares
      totalCostHkd -= avgCost * soldShares
      totalShares -= soldShares
    } else if (t.type === '派息') {
      totalDividends += Math.abs(t.total_hkd || t.dividend_amount || 0)
    }
  }

  if (totalShares <= 0) return null

  const avgCost = totalShares > 0 ? totalCostHkd / totalShares : 0
  const marketValueHkd = latestNav * totalShares * hkdRate
  const unrealizedPnl = marketValueHkd - totalCostHkd
  const totalReturn = unrealizedPnl + realizedPnl + totalDividends
  const returnRate = totalCostHkd > 0 ? totalReturn / totalCostHkd : 0

  const prr = getPrrScores(fund)

  return {
    fund,
    shares: totalShares,
    avg_cost: avgCost,
    investment_hkd: totalCostHkd,
    allocation_pct: 0, // 之後計算
    total_pct: 0,
    latest_nav: latestNav,
    market_value_hkd: marketValueHkd,
    unrealized_pnl: unrealizedPnl,
    realized_pnl: realizedPnl,
    total_dividends: totalDividends,
    total_return: totalReturn,
    return_rate: returnRate,
    prr_liquidity: prr.liquidity,
    prr_region: prr.region,
    prr_asset: prr.asset,
    prr_level: getPrrLevel(prr.liquidity, prr.region, prr.asset),
  }
}

// 計算完整投資組合
export function calculatePortfolio(
  transactions: Transaction[],
  funds: Map<string, Fund>,
  latestNavs: Map<string, number>,
  hkdRates: Map<string, number>,
): PortfolioSummary {
  // 按基金分組交易
  const txByFund = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const fundId = t.fund_id
    if (!txByFund.has(fundId)) txByFund.set(fundId, [])
    txByFund.get(fundId)!.push(t)
  }

  // 計算每檔持倉
  const allHoldings: Holding[] = []
  for (const [fundId, txs] of txByFund) {
    const fund = funds.get(fundId)
    if (!fund) continue

    const nav = latestNavs.get(fundId) || txs[txs.length - 1]?.nav || 0
    const currency = fund.currency || 'HKD'
    const hkdRate = currency === 'HKD' ? 1 : (hkdRates.get(currency) || 7.82)

    const holding = calculateHolding(fund, txs, nav, hkdRate)
    if (holding) allHoldings.push(holding)
  }

  // 計算總投資額 & 配置比例
  const totalInvestment = allHoldings.reduce((sum, h) => sum + h.investment_hkd, 0)
  const totalMarketValue = allHoldings.reduce((sum, h) => sum + h.market_value_hkd, 0)

  for (const h of allHoldings) {
    h.total_pct = totalInvestment > 0 ? h.investment_hkd / totalInvestment : 0
  }

  // 按策略分組
  const strategyOrder = ['保守型', '平衡型', '進取型']
  const byStrategy = new Map<string, Holding[]>()
  for (const h of allHoldings) {
    const s = h.fund.investment_style || '其他'
    if (!byStrategy.has(s)) byStrategy.set(s, [])
    byStrategy.get(s)!.push(h)
  }

  // 計算策略內配置比例
  for (const [, holdings] of byStrategy) {
    const strategyTotal = holdings.reduce((sum, h) => sum + h.investment_hkd, 0)
    for (const h of holdings) {
      h.allocation_pct = strategyTotal > 0 ? h.investment_hkd / strategyTotal : 0
    }
  }

  const holdingsByStrategy = strategyOrder
    .filter(s => byStrategy.has(s))
    .map(s => {
      const holdings = byStrategy.get(s)!
      const subtotalInvestment = holdings.reduce((sum, h) => sum + h.investment_hkd, 0)
      const subtotalMarketValue = holdings.reduce((sum, h) => sum + h.market_value_hkd, 0)
      const subtotalPnl = subtotalMarketValue - subtotalInvestment
      return {
        strategy: s,
        holdings,
        subtotal_investment: subtotalInvestment,
        subtotal_market_value: subtotalMarketValue,
        subtotal_pnl: subtotalPnl,
        subtotal_return_rate: subtotalInvestment > 0 ? subtotalPnl / subtotalInvestment : 0,
      }
    })

  // 加入未分類
  const otherStrategies = [...byStrategy.keys()].filter(s => !strategyOrder.includes(s))
  for (const s of otherStrategies) {
    const holdings = byStrategy.get(s)!
    const subtotalInvestment = holdings.reduce((sum, h) => sum + h.investment_hkd, 0)
    const subtotalMarketValue = holdings.reduce((sum, h) => sum + h.market_value_hkd, 0)
    const subtotalPnl = subtotalMarketValue - subtotalInvestment
    holdingsByStrategy.push({
      strategy: s,
      holdings,
      subtotal_investment: subtotalInvestment,
      subtotal_market_value: subtotalMarketValue,
      subtotal_pnl: subtotalPnl,
      subtotal_return_rate: subtotalInvestment > 0 ? subtotalPnl / subtotalInvestment : 0,
    })
  }

  return {
    total_investment: totalInvestment,
    total_market_value: totalMarketValue,
    total_pnl: totalMarketValue - totalInvestment,
    total_return_rate: totalInvestment > 0 ? (totalMarketValue - totalInvestment) / totalInvestment : 0,
    irr: 0, // 另外計算
    holdings_by_strategy: holdingsByStrategy,
  }
}

// XIRR 計算
export function calculateXIRR(
  cashflows: { date: Date; amount: number }[],
  guess: number = 0.1
): number {
  if (cashflows.length < 2) return 0

  const daysInYear = 365.25

  function xnpv(rate: number): number {
    const d0 = cashflows[0].date.getTime()
    return cashflows.reduce((sum, cf) => {
      const days = (cf.date.getTime() - d0) / (1000 * 60 * 60 * 24)
      return sum + cf.amount / Math.pow(1 + rate, days / daysInYear)
    }, 0)
  }

  function xnpvDerivative(rate: number): number {
    const d0 = cashflows[0].date.getTime()
    return cashflows.reduce((sum, cf) => {
      const days = (cf.date.getTime() - d0) / (1000 * 60 * 60 * 24)
      const t = days / daysInYear
      return sum - t * cf.amount / Math.pow(1 + rate, t + 1)
    }, 0)
  }

  // Newton-Raphson
  let rate = guess
  for (let i = 0; i < 100; i++) {
    const npv = xnpv(rate)
    const dnpv = xnpvDerivative(rate)
    if (Math.abs(dnpv) < 1e-10) break
    const newRate = rate - npv / dnpv
    if (Math.abs(newRate - rate) < 1e-10) return newRate
    rate = newRate
    if (rate < -0.99) rate = -0.99
    if (rate > 10) rate = 10
  }

  return rate
}
