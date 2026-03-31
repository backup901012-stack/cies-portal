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
| `funds` | 基金（isin, fund_type, investment_style, style, currency） |
| `transactions` | 交易（type: 買入/賣出/派息/管理費） |
| `fund_prices` | 基金淨值（每日更新） |
| `exchange_rates` | 匯率（每日更新） |
| `fund_monthly_returns` | 月度回報率 |
| `users` | 系統使用者 |

### 基金欄位說明（容易搞混）
- `fund_type`：基金大類（ETF、公募基金、私募基金）
- `style`：風格（股票基金、債券基金、貨幣基金、混合型基金）
- `investment_style`：策略（保守型、平衡型、進取型）
- `nav_source`：淨值來源（yahoo / frankfurt / manual）

## 功能模組

### 客戶管理
- 新增客戶：支援「Excel 匯入」（自動解析客戶編號+姓名+交易）和「手動輸入」
- 客戶列表、搜尋

### 交易記錄
- 手動新增交易（買入/賣出/派息/管理費）
- Excel 匯入交易（解析「現金流」工作表）
- 下載標準 Excel 模板

### 持倉計算（src/lib/holdings.ts）
- **平均成本**：`total_amount（原幣）÷ shares`（原幣/股，跟 NAV 同單位）
- **投資額(HKD)**：用 `total_hkd` 累計
- **市值(HKD)**：`最新淨值 × 持倉股數 × 匯率`
- **損益**：`市值 - 投資額 + 已實現損益 + 累計派息`
- **IRR**：Newton-Raphson XIRR（買入=負、賣出/派息=正、期末估值=正）

### 配置分析
- 策略圓餅圖（保守型/平衡型/進取型）→ 用 `investment_style`
- 區域分佈圓餅圖 → 用 `area`
- 風格分佈圓餅圖 → 用 `fund_type`（不是 style，避免跟策略混淆）
- 各基金盈虧率柱狀圖

### 自動更新（Vercel Cron）
- `/api/cron/update-fx`：每天 01:00 UTC 更新 10 種貨幣匯率
- `/api/cron/update-nav`：每天 02:00 UTC 更新有持倉基金的淨值
- ETF（xxxx.HK）→ Yahoo Finance 自動抓取
- LU 基金 → Yahoo Search 找替代 ticker 自動抓取
- HK 基金 → Yahoo 查不到，靠 Excel 匯入帶入淨值

## 已知限制
- HK 開頭基金（泰康、聯博、華夏等）無法自動抓淨值
- Vercel free tier cron 每天只跑一次
- 匯率預設用 7.82（無即時數據時的 fallback）

## Excel 標準格式
工作表名稱含「現金流」，欄位順序：
B=日期, C=科目, D=交易淨值, E=交易股數, F=派息金額, G=手續費, H=幣種, I=總金額(原幣), J=等同美金, K=等同港幣, L=ISIN CODE, M=資產名稱, N=區域, O=風格, P=策略, Q=備註
