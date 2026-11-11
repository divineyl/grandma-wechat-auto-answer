# 安装与第一次运行

一条脚本做完：微信打过来 → 全屏打开微信 → 自动点「接听」并尽量开扬声器。

不必再开 GKD。若 GKD 已经在跑，先关掉它的接听规则，避免两个一起点。

## 1. 安装 AutoJs6（旧 AutoX 链接会 404）

以前的 `kkevsekk1/AutoX` 仓库已经失效。请改用 AutoJs6。**建议用电脑浏览器下载，再用微信发给平板**——平板自带浏览器经常打不开 GitHub。

小米平板选 **arm64-v8a**。拿不准就下 AutoJs6 的 **universal** 包。

发布页：

<https://github.com/SuperMonster003/AutoJs6/releases/tag/v6.7.0>

Assets 里下载其一：

- 平板：`autojs6-v6.7.0-arm64-v8a-62db1ff8.apk`
- 或更大但不容易下错：`autojs6-v6.7.0-universal-047ae62e.apk`

直链：

<https://github.com/SuperMonster003/AutoJs6/releases/download/v6.7.0/autojs6-v6.7.0-arm64-v8a-62db1ff8.apk>

GitHub 打不开时，把完整 apk 链接贴进加速站再下载，例如 <https://ghfast.top/> 。

### 备选：AutoX.js v7

<https://github.com/aiselp/AutoX/releases/tag/v7.2.3>

下载 `Autox-v7-arm64-v8a-release-v7.2.3.apk`，不要下 `template.apk`。

### 装到平板

1. 电脑下好 APK
2. 微信发给自己或文件传输助手，平板微信里打开这个文件
3. 允许未知来源后安装
4. 桌面上会出现 **AutoJs6**（或 Autox.js）

不要从普通应用市场搜「Auto.js 破解版」。

## 2. 导入并运行

1. 把 `autox/auto-answer-fullscreen.js` 和同目录的 `autox/preflight.js` 一起用微信发到平板，放在同一个文件夹
2. 打开 AutoJs6，导入这个文件
3. 点运行
4. 打开 **无障碍**（列表里的 AutoJs6）
5. 打开 **通知使用权**（通知监听里同样找这个名字）
6. 再点一次运行。如果弹出「还不能自动接听」，按里面的说明把缺的开关打开，然后再运行。通过之后才会出现「全屏自动接听运行中」。在这之前不会自己接电话。

## 3. 小米保活（不做，过一会儿就会失效）

见 [xiaomi.md](xiaomi.md)。AutoJs6 和微信都要设。

## 4. 测一次

平板回到桌面（不要停在微信聊天里），用你的手机打微信视频。

应自动亮屏或打开微信全屏来电，并点接听。扬声器若没开，把平板音量开大，再看来电界面里的扬声器按钮。

锁屏带密码时，系统可能挡住自动解锁。家庭专用平板尽量充电常亮，或把自动锁屏调很长。

## 5. 不要每次都点「运行」

脚本不会自己常驻。设开机任务：[keep-running.md](keep-running.md)。
