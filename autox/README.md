# 脚本说明

目录名沿用早期工具 AutoX，**现在请用 [AutoJs6](https://github.com/SuperMonster003/AutoJs6)** 导入这些文件。

| 文件 | 作用 | 什么时候用 |
| --- | --- | --- |
| `auto-answer-fullscreen.js` | 监听到微信来电后拉起微信、点「接听」、尽量开扬声器 | **推荐，单独用这一条** |
| `access-watch.js` | 运行中确认无障碍和通知使用权还在。没了或确认不了就停，不再点屏幕 | 和主脚本放在同一个文件夹。不要单独运行 |
| `boot-start.js` | 开机或打开 AutoJs6 时，若主脚本没在跑就启动它 | 设定时任务时可选 |
| `open-wechat-on-call.js` | 只把微信拉到前台/小窗，**不点接听** | 仅当你坚持用 GKD 点接听时 |

不要让 `auto-answer-fullscreen.js` 和 GKD 的接听规则同时开，避免抢着点按钮。

`access-watch.js` 要和主脚本放在同一个文件夹。主脚本自己会读它。找不到、或者运行中无障碍 / 通知使用权没了，会提示「自动接听已经停了」，然后不再点屏幕。
