# THR-001～THR-008 APP Alignment Report

状态：`APP CODE PASS / CROSS-PLATFORM INTEGRATION BLOCKED`

## APP 调用契约

| 业务 | Method | APP 受保护端点 | 成功标准 |
|---|---|---|---|
| 卡列表 | GET | `/api/app/cards` | 200 + Data Source + Trace ID |
| 产品列表 | GET | `/api/app/card-products?cardType={type}` | 200 + 当前用户可申请产品 |
| 申请卡 | POST | `/api/app/cards` | 只提交 `partnerCardProductId`、`cardType` 和允许的设计/制造/配送选择 |
| 更新卡 | PUT | `/api/app/cards/{cardReference}` | 必须 204 No Content |
| 更新后验证 | GET | `/api/app/cards/{cardReference}` | 200，重新 Retrieve 并刷新 UI |

`cardReference` 是 APP BFF 的不透明引用。BFF 必须在服务端解析为 FastLink Card ID / Thredd `publicToken`；APP 不显示或存储 Thredd Token。

## 已实施

- Virtual / Physical 申请、产品与设计选择、KYC 单一来源。
- Card Type、Status、Total/Available/Pending Balance、Cardholder、Delivery/Fulfilment、Name on Card、Design。
- Parent/Child 仅在产品启用时展示。
- 3DS 仅开放 Backend 允许的 challenge language；Network Sharing 仅在 `userManageable=true` 时开放。
- Data Source / Trace ID 强制校验；失败时不加载 Mock 或缓存卡片。
- 所有 BFF 请求强制发送内存态 FastLink 用户 `Authorization: Bearer`；缺少会话时在传输前拒绝，Token 不写入页面或持久存储。
- Create Card 由 APP 生成 RFC 4122 GUID `Idempotency-Key`，仅在同一业务重试时复用；不使用订单号、交易号或时间戳。
- 响应安全门禁拒绝 PAN、Card Number、CVV、Token、KID、Certificate、Internal Control Group ID。
- Update Card 强制 204，之后 GET Retrieve 验证更新。

## Backend 现有正式契约

- `POST /cards` 已支持 `partnerCardProductId/cardType/manufacturing`，但仍要求 `tenantId/customerId/idempotencyKey`。
- `GET /cards/{id}?tenantId=...` 在 Backend 本地解析后，以 `publicToken` 调用 Thredd Retrieve。
- `PUT /cards/{publicToken}` 成功为 204；Update DTO 已支持 `config3DSecure.language` 和 `networkSharing`。

## 未对齐缺口

1. 尚无 `/api/app/*` C 端 BFF Controller；当前 `/cards` 使用 Admin Bearer Guard。
2. Tenant / Customer 尚未从真实用户登录上下文解析，现有 Create 仍要求前端提交这两个内部标识。
3. 现有 Card DTO 返回 `publicToken`、Provider、Card Status Code、Control Groups 等内部字段，需 APP-safe Response DTO。
4. Create DTO 尚未直接支持 `cardDesignId` 并校验其归属 `PartnerCardProduct`。
5. 产品读取接口目前属于 Admin，尚无当前用户安全产品列表。
6. Idempotency GUID 需由 BFF 生成/绑定，APP 不使用 Order ID、Transaction ID 或 Timestamp。
7. 无真实 Official UAT 凭据、证书与证据，因此 `THREDD OFFICIAL UAT = BLOCKED`。

## 验证

```text
Contract + component E2E: 2 files / 16 tests PASS
TypeScript + Vite production build: PASS
Official UAT: BLOCKED
```
