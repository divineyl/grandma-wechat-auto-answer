# 脚本说明

目录名沿用早期工具 AutoX，**现在请用 [AutoJs6](https://github.com/SuperMonster003/AutoJs6)** 导入这些文件。

| 文件 | 作用 | 什么时候用 |
| --- | --- | --- |
| `auto-answer-fullscreen.js` | 监听到微信来电后拉起微信、点「接听」、尽量开扬声器 | **推荐，单独用这一条** |
| `boot-start.js` | 开机或打开 AutoJs6 时，若主脚本没在跑就启动它。自己不点屏幕 | 设定时任务时可选 |
| `open-wechat-on-call.js` | 只把微信拉到前台/小窗，**不点接听，也不点发送** | 仅当你坚持用 GKD 点接听时 |

两个会动手的脚本出厂都是关的：

- 主脚本把 `AUTO_ANSWER_ENABLED` 改成 `true` 才接听。`ALLOW_CALLER_NAMES` 为空表示接所有来电。
- 小窗脚本把 `ENABLED` 改成 `true` 才打开微信。

不要让 `auto-answer-fullscreen.js` 和 GKD 的接听规则同时开，避免抢着点按钮。会点什么、不会点什么见 [../SECURITY.md](../SECURITY.md)。
