# 脚本说明

目录名沿用早期工具 AutoX，**现在请用 [AutoJs6](https://github.com/SuperMonster003/AutoJs6)** 导入这些文件。

`auto-answer-fullscreen.js` 会先做设置检查（无障碍、通知使用权等）。缺了会停住并用白话说明，不会开始接听。请和 `preflight.js` 放在同一个文件夹。

| 文件 | 作用 | 什么时候用 |
| --- | --- | --- |
| `auto-answer-fullscreen.js` | 监听到微信来电后拉起微信、点「接听」、尽量开扬声器 | **推荐，单独用这一条** |
| `boot-start.js` | 开机或打开 AutoJs6 时，若主脚本没在跑就启动它 | 设定时任务时可选 |
| `open-wechat-on-call.js` | 只把微信拉到前台/小窗，**不点接听** | 仅当你坚持用 GKD 点接听时 |

不要让 `auto-answer-fullscreen.js` 和 GKD 的接听规则同时开，避免抢着点按钮。
