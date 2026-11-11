# 安全与使用边界

本项目用系统无障碍和通知监听，在**你自己或家人同意使用的设备**上接听微信来电。它不是远程控制木马，也不改微信安装包。

脚本和 GKD 规则**出厂都是关的**。不改开关，就不会点屏幕。

## 请只这样用

- 设备是家里的：老人平板、老人机，使用前家人知情。
- 不要装到别人的手机上，不要用来偷看或拦截别人的通话。
- 不要从应用市场安装来路不明的「Auto.js 破解版」。请从文档里的官方发布页下载。
- 不要把打包出来的 APK 发给别人，也不要放进本仓库。

## 配置

主脚本 `autox/auto-answer-fullscreen.js` 最上面：

| 名字 | 出厂值 | 含义 |
| --- | --- | --- |
| `AUTO_ANSWER_ENABLED` | `false` | 写成 `true` 才会接听。不要加引号。 |
| `ALLOW_CALLER_NAMES` | `[]` | 空名单表示接听所有微信语音/视频。写成 `["妈妈"]` 就只接通知里带这个名字的来电。 |

`[]` 且开关为 `true` 时，陌生人打来也会接。只有专用平板才这样留。名字要和微信通知上的字一样。聊天记录里出现同名，不算。

可选的小窗脚本 `autox/open-wechat-on-call.js` 里，`ENABLED` 出厂也是 `false`。它只负责打开微信，不点接听，也不点发送。不要和主脚本一起开。

GKD 规则文件里，接听规则和横幅规则的 `enable` 出厂是 `false`。在 GKD 里手动打开后，会接听**所有**来电。GKD 没有名单。要只接某几个人，用主脚本，并关掉 GKD 的接听规则。

## 开启后会点什么

只点微信里这些字：

- 「接听」「接听通话」「接听视频」，并且同一画面上还要有「挂断」或「拒绝」
- 刚收到来电通知之后的大约 20 秒内，较短的「邀请你视频通话」或「邀请你语音通话」
- 「扬声器已关」（只点这一次，用来打开扬声器）

点这些字时，点的是这个字所在的按钮。按钮太大、不在屏幕里、或不属于微信，就不会点。同一次来电画面里，接听或横幅最多点两次，然后停手，直到这个画面消失。这是为了避免停在那里一直点。

## 不会点什么

- 不点「发送」。画面上看得见「发送」时，这次不自动接听。
- 不点「挂断」「拒绝」「取消」，避免把电话挂掉，或把「取消」当成来电。
- 不按屏幕位置去猜按钮。猜错时很容易点到聊天输入框右边的发送。
- 聊天或通知里只是出现「视频通话」「语音通话」，不会当成来电，也不会因此打开微信。
- 「未接」「已结束」「已取消」「已拒绝」「已挂断」「通话时长」不会当成新的来电。
- 微信是英文时，不认识 Answer / Decline / Send，所以不会去点。请把微信语言改成中文。
- 不会替你发消息，也不会新增别的自动发消息功能。

## 仍然要人来管的风险

- 开关打开且名单为空：所有微信语音/视频都会接，包括不认识的人。
- 名单里的名字写错：该接的人打不进来。通知权限没开时，名单模式也不会接。
- 来电按钮上没有上面列出的中文时，脚本不会猜，这次就接不到。
- 锁屏密码、省电把 AutoJs6 杀掉、无障碍被系统关掉，都还是会失败。看 [docs/troubleshooting.md](docs/troubleshooting.md)。
- 更新脚本或规则后，开关会回到关闭。要重新打开，并先停掉旧脚本。

## 上报问题

请用 GitHub Issues。不要在 issue 里贴账号、验证码、设备锁定密码，也不要贴真实家人昵称。

## English

This toolkit answers WeChat calls with Android accessibility. It is not remote-control software and it does not modify WeChat.

Shipped defaults are off: `AUTO_ANSWER_ENABLED` is `false`, the legacy window script's `ENABLED` is `false`, and the GKD rules are disabled. Nothing is tapped until someone turns a switch on.

After it is enabled, it only taps exact Chinese call labels (`接听`, a short `邀请你视频通话` / `邀请你语音通话` line, and `扬声器已关`). It does not tap `发送` (Send). If that button is on screen, it skips the attempt. It does not tap guessed screen coordinates, hang-up, or cancel, and it does not treat an ordinary chat that merely mentions `视频通话` as an incoming call.

An empty name list answers every WeChat voice and video call. Put the tablet's copy of the list only on that family device. Do not commit real names. English WeChat labels are ignored on purpose.
