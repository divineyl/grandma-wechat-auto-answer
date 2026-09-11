# 可选：只用 GKD 点「接听」

[GKD](https://github.com/gkd-kit/gkd) 能点**已经出现在屏幕上**的按钮。微信不在当前页、没有全屏来电、也没有「邀请你视频通话」横幅时，它点不到。

**推荐优先用 AutoJs6 主脚本**，见 [getting-started.md](getting-started.md)。下面留给已经在用 GKD、或主脚本暂时跑不起来的情况。

不要让 GKD 接听规则和 `auto-answer-fullscreen.js` 同时开。

## 安装

1. 从官网正式版下载：<https://gkd.li/guide/> 或 <https://github.com/gkd-kit/gkd/releases>（`gkd-v*.apk`）
2. 不要装应用市场里的「增强版 / 黄金版」
3. 允许未知来源后安装，打开 **无障碍**
4. 开关灰色时：应用信息 → 高级设置 → **允许受限制的设置**，再开无障碍
5. 首页打开 **常驻通知**，并给 GKD 做和微信一样的[小米保活](xiaomi.md)

## 导入规则

本仓库 `gkd/`：

| 文件 | 贴到哪里 |
| --- | --- |
| `wechat-auto-answer.json5` | 能添加整份订阅时用 |
| `app-rule-wechat.json5` | **添加应用规则**（平板上往往只有这一项） |
| `global-incoming-banner.json5` | **添加全局规则**（用来点桌面/通知栏上的邀请横幅） |

若列表里已经有「微信」应用规则，先删再贴新的。

默认会接听所有微信语音/视频。若要只接某个家人，需要按来电界面上的显示名自己改规则，**不要**把真实昵称提交回本仓库。

## 和 AutoJs6 小窗脚本配合（旧方案）

`autox/open-wechat-on-call.js` 只负责把微信拉到前台/小窗，接听仍交给 GKD。现在已被 `auto-answer-fullscreen.js` 替代，一般不必再装。
