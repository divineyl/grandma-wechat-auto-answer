/**
 * 微信来电自动全屏接听（AutoJs6）
 * 用主线程轮询点「接听」，避免后台线程点不动。
 */

var WECHAT = "com.tencent.mm";
var pendingUntil = 0;
var lastToastAt = 0;
var positionFallbackLogged = false;
var TERMINAL_CALL_WORDS = ["未接", "未接通", "已结束", "已取消", "已拒绝", "已挂断", "通话结束", "通话时长", "对方已取消", "对方已拒绝"];

function waitAccessibility() {
    var i = 0;
    while (i < 90) {
        var ready = false;
        try {
            ready = !!auto.service;
        } catch (e) {
            logFail("读取无障碍状态失败", e);
        }
        if (ready) {
            break;
        }
        sleep(1000);
        i++;
    }
    try {
        auto.waitFor();
    } catch (e2) {
        logFail("等待无障碍失败", e2);
    }
}

waitAccessibility();

function str(v) {
    if (v == null) {
        return "";
    }
    return "" + v;
}

function logFail(where, err) {
    var msg = where;
    try {
        if (err && err.message) {
            msg += ": " + err.message;
        } else if (err) {
            msg += ": " + err;
        }
    } catch (e) {}
    try {
        log(msg);
    } catch (e2) {}
}

function isTerminalCallText(s) {
    var i;
    if (!s) {
        return false;
    }
    for (i = 0; i < TERMINAL_CALL_WORDS.length; i++) {
        if (s.indexOf(TERMINAL_CALL_WORDS[i]) >= 0) {
            return true;
        }
    }
    return false;
}

function noteText(n) {
    var s = "";
    try {
        s += str(n.getTitle());
    } catch (e) {
        logFail("读取通知标题失败", e);
    }
    try {
        s += " " + str(n.getText());
    } catch (e2) {
        logFail("读取通知内容失败", e2);
    }
    try {
        s += " " + str(n.tickerText);
    } catch (e3) {}
    return s;
}

function isCallText(s) {
    if (!s || isTerminalCallText(s)) {
        return false;
    }
    if (s.indexOf("邀请你视频通话") >= 0 || s.indexOf("邀请你语音通话") >= 0) {
        return true;
    }
    if (s.indexOf("视频通话") >= 0 || s.indexOf("语音通话") >= 0) {
        return true;
    }
    return false;
}

function clickNode(node) {
    if (!node) {
        return false;
    }
    try {
        if (node.click()) {
            return true;
        }
    } catch (e) {
        logFail("点击控件失败", e);
    }
    try {
        var b = node.bounds();
        if (b) {
            click(b.centerX(), b.centerY());
            return true;
        }
    } catch (e2) {
        logFail("按坐标点击失败", e2);
    }
    return false;
}

function firstDescOrText(value) {
    var node = null;
    try {
        node = desc(value).findOnce();
        if (node) {
            return node;
        }
    } catch (e) {}
    try {
        node = text(value).findOnce();
        if (node) {
            return node;
        }
    } catch (e) {}
    try {
        node = packageName(WECHAT).desc(value).findOnce();
        if (node) {
            return node;
        }
    } catch (e) {}
    try {
        node = packageName(WECHAT).text(value).findOnce();
        if (node) {
            return node;
        }
    } catch (e) {}
    return null;
}

function findAnswer() {
    var n = firstDescOrText("接听") || firstDescOrText("接听通话") || firstDescOrText("接听视频");
    if (n) {
        return n;
    }
    try {
        if (click("接听")) {
            return true;
        }
    } catch (e) {
        logFail("按文字点击接听失败", e);
    }
    return null;
}

function findHangup() {
    // 「取消」在普通弹窗里很常见，不能把它当成来电界面。
    return firstDescOrText("挂断") || firstDescOrText("拒绝");
}

function findBanner() {
    try {
        var a = textContains("邀请你视频通话").findOnce();
        if (a) {
            return a;
        }
    } catch (e) {}
    try {
        var b = textContains("邀请你语音通话").findOnce();
        if (b) {
            return b;
        }
    } catch (e) {}
    try {
        var c = textContains("视频通话").findOnce();
        if (c && !isTerminalCallText(str(c.text()))) {
            return c;
        }
    } catch (e) {}
    return null;
}

function clickAnswerByPosition() {
    if (!findHangup()) {
        return false;
    }
    if (!positionFallbackLogged) {
        positionFallbackLogged = true;
        log("没找到接听文字，改为按来电界面右下角点击");
    }
    var w = device.width;
    var h = device.height;
    click(w * 0.75, h * 0.82);
    sleep(200);
    click(w * 0.78, h * 0.88);
    sleep(200);
    click(w * 0.70, h * 0.80);
    return true;
}

function turnOnSpeaker() {
    var n = firstDescOrText("扬声器已关");
    if (n) {
        clickNode(n);
    }
}

function tryWakeScreen() {
    try {
        if (!device.isScreenOn()) {
            device.wakeUp();
            sleep(500);
        }
    } catch (e) {
        logFail("亮屏失败", e);
    }
}

function tryLaunchWeChat() {
    var opened = false;
    try {
        app.launchApp("微信");
        opened = true;
    } catch (e) {
        logFail("按名称打开微信失败", e);
    }
    try {
        app.launchPackage(WECHAT);
        opened = true;
    } catch (e2) {
        logFail("按包名打开微信失败", e2);
    }
    try {
        app.startActivity({
            packageName: WECHAT,
            className: "com.tencent.mm.ui.LauncherUI",
        });
        opened = true;
    } catch (e3) {
        logFail("打开微信主界面失败", e3);
    }
    return opened;
}

function wakeAndOpenWeChat(n) {
    tryWakeScreen();
    try {
        if (n) {
            n.click();
        }
    } catch (e) {
        logFail("点击来电通知失败", e);
    }
    if (!tryLaunchWeChat()) {
        sleep(400);
        if (!tryLaunchWeChat()) {
            log("打开微信两次都失败，改为只等屏幕上的接听按钮");
        }
    }
}

function tryAnswerOnce() {
    var serviceOn = false;
    try {
        serviceOn = !!auto.service;
    } catch (e) {
        logFail("读取无障碍状态失败", e);
    }
    if (!serviceOn) {
        var now = Date.now();
        if (now - lastToastAt > 8000) {
            lastToastAt = now;
            try {
                toast("无障碍被关掉了，请重新打开 AutoJs6");
            } catch (e2) {
                logFail("提示无障碍失败", e2);
            }
            log("无障碍服务不可用");
        }
        return false;
    }
    var banner = findBanner();
    if (banner) {
        clickNode(banner);
        sleep(400);
    }
    var ans = findAnswer();
    if (ans === true) {
        sleep(800);
        turnOnSpeaker();
        return true;
    }
    if (ans) {
        if (clickNode(ans)) {
            sleep(800);
            turnOnSpeaker();
            return true;
        }
    }
    if (Date.now() < pendingUntil) {
        if (clickAnswerByPosition()) {
            sleep(800);
            turnOnSpeaker();
            return true;
        }
    }
    return false;
}

function onMaybeCall(n) {
    try {
        if (!n) {
            return;
        }
        var pkg = "";
        try {
            pkg = str(n.getPackageName());
        } catch (ePkg) {
            logFail("读取通知包名失败", ePkg);
            return;
        }
        if (pkg !== WECHAT) {
            return;
        }
        var t = noteText(n);
        if (!isCallText(t)) {
            return;
        }
        var now = Date.now();
        if (now < pendingUntil) {
            // 同一通来电会连续刷新通知。再次拉起微信主界面可能把接听页盖掉。
            pendingUntil = now + 20000;
            return;
        }
        pendingUntil = now + 20000;
        positionFallbackLogged = false;
        try {
            toast("检测到微信来电，正在接听");
        } catch (eToast) {
            logFail("提示来电失败", eToast);
        }
        wakeAndOpenWeChat(n);
    } catch (e) {
        logFail("处理来电通知失败", e);
    }
}

function startNotificationWatch() {
    var attempt;
    var lastErr = null;
    for (attempt = 1; attempt <= 3; attempt++) {
        try {
            events.observeNotification();
            return true;
        } catch (e) {
            lastErr = e;
            logFail("监听通知失败，第" + attempt + "次", e);
            if (attempt < 3) {
                try {
                    sleep(1000);
                } catch (eSleep) {}
            }
        }
    }
    try {
        toast("请打开通知使用权：关掉再打开 AutoJs6 那一项");
    } catch (eToast) {
        logFail("提示通知使用权失败", eToast);
    }
    try {
        app.startActivity({
            action: "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS",
        });
    } catch (e2) {
        logFail("打开通知使用权设置失败", e2);
    }
    logFail("通知监听未就绪，仍会尝试点屏幕上的接听", lastErr);
    return false;
}

function listenForNotifications() {
    try {
        events.onNotification(function (n) {
            onMaybeCall(n);
        });
        events.on("notification", function (n) {
            onMaybeCall(n);
        });
    } catch (e) {
        logFail("注册通知回调失败", e);
    }
}

startNotificationWatch();
listenForNotifications();

setInterval(function () {
    try {
        tryAnswerOnce();
    } catch (e) {
        logFail("点接听失败", e);
    }
}, 400);

toast("全屏自动接听运行中");
log("wechat auto-answer started");
