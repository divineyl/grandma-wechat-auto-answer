/**
 * 来电小窗
 * 听到微信视频/语音来电通知后，尝试用小米小窗打开微信，失败则把微信拉到前台。
 * 接听仍由 GKD 去点。本脚本不点屏幕上的按钮，也不点「发送」。
 *
 * 安全开关 ENABLED 出厂是 false，不会打开微信。
 * 只有在已经改用 GKD 点接听、并且这是家人专用平板时，才改成 true。
 * 不要和 auto-answer-fullscreen.js 一起开。
 */

const WECHAT = "com.tencent.mm";
const COOLDOWN_MS = 8000;
var ENABLED = false;

let lastOpenAt = 0;

function asText(value) {
  if (value == null) {
    return "";
  }
  return String(value);
}

function notificationText(n) {
  return asText(n.getTitle()) + " " + asText(n.getText());
}

function isIncomingCall(text) {
  if (!text) {
    return false;
  }
  const blocked = ["未接", "已结束", "已取消", "已拒绝", "已挂断", "通话时长", "对方已取消"];
  let i;
  for (i = 0; i < blocked.length; i++) {
    if (text.indexOf(blocked[i]) >= 0) {
      return false;
    }
  }
  if (text.indexOf("邀请你视频通话") >= 0) {
    return true;
  }
  if (text.indexOf("邀请你语音通话") >= 0) {
    return true;
  }
  return false;
}

function openWeChatMiniWindow() {
  const Intent = android.content.Intent;
  const pm = context.getPackageManager();
  const intent = pm.getLaunchIntentForPackage(WECHAT);
  if (intent == null) {
    return false;
  }
  intent.addFlags(
    Intent.FLAG_ACTIVITY_NEW_TASK |
      Intent.FLAG_ACTIVITY_REORDER_TO_FRONT |
      Intent.FLAG_ACTIVITY_SINGLE_TOP
  );
  try {
    const options = android.app.ActivityOptions.makeBasic();
    try {
      const method = options
        .getClass()
        .getMethod("setLaunchWindowingMode", java.lang.Integer.TYPE);
      method.invoke(options, java.lang.Integer.valueOf(5));
    } catch (ignore) {}
    try {
      const metrics = context.getResources().getDisplayMetrics();
      const width = metrics.widthPixels;
      const height = metrics.heightPixels;
      const bounds = new android.graphics.Rect(
        Math.floor(width * 0.42),
        Math.floor(height * 0.06),
        Math.floor(width * 0.98),
        Math.floor(height * 0.74)
      );
      options.setLaunchBounds(bounds);
    } catch (ignore) {}
    context.startActivity(intent, options.toBundle());
    return true;
  } catch (err) {
    log("小窗打开失败: " + err);
    return false;
  }
}

function bringWeChatUp(n) {
  if (openWeChatMiniWindow()) {
    toast("已尝试打开微信小窗");
    return;
  }
  try {
    n.click();
  } catch (ignore) {}
  app.launchPackage(WECHAT);
  toast("已打开微信");
}

if (ENABLED !== true) {
  if (ENABLED === false) {
    toast("来电小窗未开启。默认不会打开微信。确认要和 GKD 一起用时，把 ENABLED 改成 true 再运行");
  } else {
    toast("ENABLED 必须写成 true 或 false，不能加引号。当前不会打开微信");
  }
  setInterval(function () {}, 60000);
} else {
  try {
    events.observeNotification();
  } catch (err) {
    toast("请打开「通知使用权」，再重新运行本脚本");
    try {
      app.startActivity({
        action: "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS",
      });
    } catch (ignore) {}
    throw err;
  }

  events.on("notification", function (n) {
    try {
      if (n.getPackageName() !== WECHAT) {
        return;
      }
      if (!isIncomingCall(notificationText(n))) {
        return;
      }
      const now = Date.now();
      if (now - lastOpenAt < COOLDOWN_MS) {
        return;
      }
      lastOpenAt = now;
      bringWeChatUp(n);
    } catch (err) {
      log(err);
    }
  });

  toast("来电开微信小窗：已在运行。本脚本不点接听，也不点发送");
  setInterval(function () {}, 60000);
}
