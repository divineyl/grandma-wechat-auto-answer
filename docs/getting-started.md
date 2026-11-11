# 安装与第一次运行

一条脚本做完：微信打过来 → 全屏打开微信 → 自动点「接听」并尽量开扬声器。

脚本出厂是关的，不改开关就不会点屏幕。安全边界见 [SECURITY.md](../SECURITY.md)。

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

## 2. 先改安全开关，再把文件发到平板

用电脑记事本打开 `autox/auto-answer-fullscreen.js`。最上面是：

```javascript
var AUTO_ANSWER_ENABLED = false;
var ALLOW_CALLER_NAMES = [];
```

1. 先确认这是老人那台平板，不是你每天用的手机。
2. 把 `false` 改成 `true`。不要写成 `"true"`，不要加引号。
3. 名单二选一：
   - 专用平板、谁打来都该接：保持 `[]`。
   - 只接某几个人：写成 `["妈妈", "爸爸"]`。名字要和微信来电通知上的字一样。不要把真实名字传回仓库。
4. 保存。

以后更新了仓库里的脚本，这两行会回到出厂值。更新前先把你改过的两行抄下来，贴回新文件。

## 3. 导入并运行

1. 把改好的 `autox/auto-answer-fullscreen.js` 用微信发到平板
2. 打开 AutoJs6，导入这个文件
3. 点运行
4. 打开 **无障碍**（列表里的 AutoJs6）
5. 打开 **通知使用权**（通知监听里同样找这个名字）
6. 如果刚才那份还在跑，先停止它，再运行这一份。看到「已有一份接听脚本在运行」就是旧的还在。

运行后的提示：

| 提示里的字 | 含义 |
| --- | --- |
| 自动接听未开启 | 开关还是 `false`，不会点屏幕 |
| 将接听所有微信来电 | 名单是空的，谁打来都接 |
| 只接听名单中的联系人 | 只有通知里带名单名字才接 |
| 接听名单写错了 | 名单不是 `[]` 这种列表，当前不会接 |

改开关或名单之后，必须先停止，再重新运行。正在跑的那一份不会自己变成新的。

## 4. 小米保活（不做，过一会儿就会失效）

见 [xiaomi.md](xiaomi.md)。AutoJs6 和微信都要设。这些权限会让脚本能点屏幕，所以只在这台平板上开。

## 5. 测一次

平板回到桌面（不要停在微信聊天里），用你的手机打微信视频。

应看到「检测到微信来电，正在接听」，接着「已点接听」。扬声器若没开，把平板音量开大，再看来电界面里是不是「扬声器已关」；脚本只会点「扬声器已关」，不会把已经打开的扬声器再点关掉。

如果提示「看见发送按钮」，先收起聊天键盘，再打一次。脚本这时不会点，避免把消息发出去。接不到时按 [troubleshooting.md](troubleshooting.md) 对，不要假设已经生效。

锁屏带密码时，系统可能挡住自动解锁。家庭专用平板尽量充电常亮，或把自动锁屏调很长。

## 6. 不要每次都点「运行」

脚本不会自己常驻。设开机任务：[keep-running.md](keep-running.md)。
