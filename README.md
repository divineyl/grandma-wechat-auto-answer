# 微信自动接听

[English](#english) · [中文](#中文)

给家里老人用的 **Android（尤其是小米平板）** 方案：微信视频/语音打过来时，平板自己全屏接听，老人不用会点屏幕。

Auto-answer incoming WeChat voice/video calls on a family Android tablet using AutoJs6 accessibility — no remote-control malware, no WeChat APK patching.

---

## 中文

### 这是什么

子女出门后，老人不会接微信视频。把脚本装在**老人那台平板**上，你用自己的手机打过去，平板会：

1. 听到微信来电通知
2. 亮屏并打开微信
3. 点「接听」，并尽量打开扬声器

不改微信安装包，不远程控制平板，也不需要老人学新软件。她只看到微信被接通。

### 推荐方案（请用这个）

| 步骤 | 说明 |
| --- | --- |
| 1 | 平板安装 [AutoJs6](https://github.com/SuperMonster003/AutoJs6/releases) |
| 2 | 导入并运行 [`autox/auto-answer-fullscreen.js`](autox/auto-answer-fullscreen.js)。同目录的 [`autox/access-watch.js`](autox/access-watch.js) 要一起放在平板上 |
| 3 | 打开无障碍、通知使用权 |
| 4 | 设开机自动运行，并给 AutoJs6 / 微信做小米保活 |

详细步骤：

1. [安装与第一次运行](docs/getting-started.md)
2. [设成开机后一直生效](docs/keep-running.md)
3. [小米权限与保活](docs/xiaomi.md)
4. [离家前自测清单](docs/checklist.md)
5. [接不了时对照](docs/troubleshooting.md)

### 原理（为什么需要脚本）

微信来电时，必须先出现「接听」按钮，自动点击才有意义。

- 只靠 [GKD](https://github.com/gkd-kit/gkd) 这类点选工具时：微信已经在前台或小窗，规则可以点「接听」；微信被切走、被杀掉时，屏幕上没有按钮，GKD 帮不上忙。
- 本仓库主脚本额外做了两件事：监听微信来电通知、把微信拉到全屏，再点接听。

### 可选：GKD

已经装了 GKD 可以留着，但**建议关掉它的接听规则**，改用上面的脚本，避免两套一起点。GKD 单独方案和限制见 [docs/gkd.md](docs/gkd.md)。

### 做不到的

- 官方微信没有「自动接听」开关，这是设备无障碍自动化，不是腾讯功能。
- 锁屏有密码时，系统可能挡住自动解锁。家庭专用平板建议充电常亮，或把自动锁屏调很长。
- 脚本不会在你点「停止」或系统杀掉 AutoJs6 之后自己复活，必须做 [保活与定时任务](docs/keep-running.md)。
- 默认会接听**所有**微信语音/视频。只给家人用的平板一般没问题。

### 仓库结构

```
autox/          AutoJs6 脚本（目录名沿用旧工具 AutoX）
gkd/            可选的 GKD 规则
docs/           安装、保活、自测、排障
scripts/        校验 GKD 规则是否仍能解析
```

### 许可与安全

代码使用 [MIT](LICENSE)。使用边界见 [SECURITY.md](SECURITY.md)：只装在家人知情的设备上。

本项目与腾讯 / 微信无关，也不属于 AutoJs6、GKD 官方。

---

## English

**wechat-auto-answer** is a small, family-device toolkit for Android (tested on Xiaomi tablets):

- Primary path: an [AutoJs6](https://github.com/SuperMonster003/AutoJs6) script that listens for WeChat call notifications, brings WeChat to the foreground, taps **Answer**, and tries to enable the speaker. If accessibility or notification access disappears while it is running, it stops and does not keep tapping.
- Optional path: [GKD](https://github.com/gkd-kit/gkd) click rules, which only work when the Answer button is already on screen.

This is accessibility automation on hardware you own. It is not a remote-access trojan and it does not modify the WeChat APK.

Start here: [docs/getting-started.md](docs/getting-started.md) (Chinese, step-by-step for Xiaomi).
