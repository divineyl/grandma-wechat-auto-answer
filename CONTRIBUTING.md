# 参与贡献

先看 [README.md](README.md) 里的推荐方案，再改代码。

## 改脚本

- 主脚本：`autox/auto-answer-fullscreen.js`（AutoJs6）
- 开机拉起：`autox/boot-start.js`
- 用 `var` / 旧式 Auto.js API，避免只在 Node 里能跑的语法
- 接听按钮文案因微信版本会变，改选择器时请写清你用的微信版本和机型

## 改 GKD 规则

改完后在仓库根目录执行：

```bash
pip install -r requirements.txt
python scripts/validate_gkd.py
```

校验会解析 GKD 规则，并确认安全开关仍是关闭。改脚本后也跑这一条。

## 不要做的

- 不要提交微信破解、注入、改包、抓号
- 不要提交来路不明的 APK
- 不要把真实家人的昵称、微信号写进仓库
- 不要把 `AUTO_ANSWER_ENABLED`、`ENABLED` 或 GKD 的 `enable` 改成默认开启再提交
- 不要加按屏幕比例乱点的逻辑，不要用「取消」判断来电，不要匹配单独的「视频通话」「语音通话」
- 会点的字只保留：接听、短的「邀请你…通话」、「扬声器已关」。看见「发送」必须停
