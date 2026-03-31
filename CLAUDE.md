# CIES 客戶投資組合管理系統

## 專案概述
線上客戶投資組合管理系統，供 CIES 顧問追蹤客戶基金持倉、交易、IRR、配置分析。

## 技術棧
- **前端**：Next.js 16 + TypeScript + Tailwind CSS + Recharts
- **後端**：Supabase（PostgreSQL + Auth + RLS）
- **部署**：Vercel（含 Cron Jobs）
- **套件**：xlsx（Excel 解析）

## 線上網址
- **正式網址**：https://cies-portal.vercel.app
- **測試帳號**：`cbe566` / `asd566123`（登入時自動補 @cies.com）

## Supabase
- **專案 ID**：jvmnntavizbjsgofnusy
- **URL**：https://jvmnntavizbjsgofnusy.supabase.co
- **重要 View**：`active_fund_ids`（不受 RLS 限制，供 cron 查有效基金）

## GitHub
- **Repo**：backup901012-stack/cies-portal

## 資料庫結構

| 表名 | 用途 |
|---|---|
| `cies_clients` | 客戶（advisor_id, client_code, name） |
| `funds` | 基金（isin, fund_type, investment_style, style, currency, yahoo_ticker） |
| `transactions` | 交易（type: 買入/賣出/派息/管理費） |
| `fund_prices` | 基金淨值（每日更新） |
| `exchange_rates` | 匯率（每日更新） |
| `fund_monthly_returns` | 月度回報率 |
| `users` | 系統使用者 |
| `active_fund_ids` | View，不受 RLS 限制，回傳有交易的基金 ID |

### 基金欄位說明（容易搞混）
- `fund_type`：基金大類（ETF、公募基金、私募基金）
- `style`：風格（股票基金、債券基金、貨幣基金、混合型基金）
- `investment_style`：策略（保守型、平衡型、進取型）
- `nav_source`：淨值來源（yahoo / frankfurt / manual）
- `yahoo_ticker`：Yahoo Finance 替代 ticker（如 0P0001PKLO），自動搜尋後儲存

## 功能模組

### 客戶管理
- 新增客戶：支援「Excel 匯入」（自動解析客戶編號+姓名+交易+持倉淨值）和「手動輸入」
- 客戶列表、搜尋

### 交易記錄
- 手動新增交易（買入/賣出/派息/管理費）
- Excel 匯入交易（解析「現金流」工作表 + 「持倉比例配置表」取最新淨值）
- 下載標準 Excel 模板

### 持倉計算（src/lib/holdings.ts）
- **平均成本**：`total_amount（原幣）÷ shares`（原幣/股，跟 NAV 同單位，不能用 HKD）
- **投資額**：用 `total_hkd` 累計
- **市值**：`最新淨值 × 持倉股數 × 匯率`
- **未實現損益**：`市值 - 投資額`
- **已實現損益**：`賣出收入 - 賣出股數 × 平均成本(HKD)`
- **含息總收益**：`未實現 + 已實現 + 累計派息`
- **含息回報率**：`含息總收益 ÷ 投資額`
- **整體 IRR**：Newton-Raphson XIRR（買入=負、賣出/派息=正、期末市值=正）
- **幣別切換**：右上角 HKD/USD 按鈕，金額即時轉換，平均成本和淨值保持原幣

### 配置分析
- 策略圓餅圖（保守型/平衡型/進取型）→ 用 `investment_style`
- 區域分佈圓餅圖 → 用 `area`
- 風格分佈圓餅圖 → 用 `fund_type`（不是 style，避免跟策略混淆）
- 各基金盈虧率柱狀圖

### 自動更新（Vercel Cron）
- `/api/cron/update-fx`：每天 01:00 UTC 更新 10 種貨幣匯率
- `/api/cron/update-nav`：每天 02:00 UTC 更新所有有持倉基金的淨值
- 淨值搜尋順序：yahoo_ticker → ISIN 直查 → Yahoo Search API → investing.com
- 找到的 ticker 自動存回 funds.yahoo_ticker，下次免搜尋

## 淨值自動更新策略（重要！不能放棄任何基金）
1. 有 `yahoo_ticker` → 直接用
2. 用 ISIN 去 Yahoo Finance chart API 查
3. 用 ISIN 去 Yahoo Search API 找替代 ticker（如 HK0000869849 → 0P0001PKLO）
4. 用基金名稱去 investing.com 搜尋
5. 找到後儲存 yahoo_ticker，避免重複搜尋
6. **所有公開基金都能查到，絕對不能輕易放棄標記 manual**

## Excel 標準格式
### 現金流工作表
工作表名稱含「現金流」，欄位順序：
B=日期, C=科目, D=交易淨值, E=交易股數, F=派息金額, G=手續費, H=幣種, I=總金額(原幣), J=等同美金, K=等同港幣, L=ISIN CODE, M=資產名稱, N=區域, O=風格, P=策略, Q=備註

### 持倉比例配置表
工作表名稱含「持倉」，用於抓取最新淨值：
B=ISIN CODE, L=最新淨值（第11欄）

### 客戶資訊解析
從標題行自動匹配：`P005812NC 俞悅 — CIES 投資組合現金流追蹤`
