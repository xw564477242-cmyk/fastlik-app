# THR-001～THR-008 APP acceptance

Card Center 已升级为受保护的真实数据客户端，不再包含运行时 Mock 卡片或静默回退。

已实现：

- 虚拟卡与实体卡申请；请求只提交 `partnerCardProductId`、`cardType` 以及产品允许的设计、制造、语言和配送方式选择；
- 姓名、持卡人身份和配送地址由 Backend 从已验证 KYC 映射，不在申请表重复录入；
- 卡类型、状态、产品、网络、卡尾号、总余额、可用余额和待入账金额；
- 持卡人档案、配送地址、Fulfilment 状态、卡面设计；
- 仅在产品开启时展示 Parent/Child 关系；
- 只暴露 Backend 允许用户修改的 3DS challenge language 和 Network Sharing；
- Update Card 强制 `204 No Content`，随后重新 Retrieve 验证并刷新界面；
- 数据源标识 `Sandbox` / `Official UAT` / `Production`；响应缺少 Data Source 或 Trace ID 时拒绝显示；
- 响应安全门禁拒绝 PAN、Card Number、CVV、Token、KID、Certificate 和内部 Control Group ID。

验证：

```text
npm run build: PASS
npm test: 2 files / 16 tests PASS
Contract: PASS
Component E2E: PASS
Official UAT: BLOCKED（尚无真实凭据、证书和受保护 APP API）
```
