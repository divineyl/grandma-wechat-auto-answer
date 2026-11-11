# GKD 规则（可选）

主方案请用 `../autox/auto-answer-fullscreen.js`。这里是给 GKD 用的点击规则，说明见 [../docs/gkd.md](../docs/gkd.md)。

规则里的 `enable` 出厂是 `false`，贴进 GKD 后不会马上点屏幕。打开后会接所有微信来电，没有联系人名单，并且看见「发送」就停。不要和主脚本同时开。

| 文件 | 用途 |
| --- | --- |
| `wechat-auto-answer.json5` | 整份订阅 |
| `app-rule-wechat.json5` | 添加应用规则 |
| `global-incoming-banner.json5` | 添加全局规则（点邀请横幅） |
