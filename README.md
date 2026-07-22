# FastLink Wallet App

FastLink Payment 的 C 端錢包基礎版本，包含：

- Wallet Home：數字資產、法幣、卡餘額與交易記錄
- Card Center：虚拟卡/实体卡申请、卡片状态与余额、持卡人、配送履约、卡面设计、3DS 和网络共享
- Dashboard：資產趨勢、配置、消費與帳戶健康
- 響應式桌面及手機導航

## 本地驗收

```bash
npm install
npm run build
npm test
npm run dev
```

頁面路由：`#/wallet`、`#/cards`、`#/dashboard`。

Card Center 不含运行时 Mock 回退。API 响应必须带 `SANDBOX`、`OFFICIAL_UAT` 或 `PRODUCTION` 数据源及 Trace ID，否则页面显示明确阻塞，不展示缓存或示例卡片。
