/**
 * 微信来电自动全屏接听（AutoJs6）
 * 用主线程轮询点「接听」，避免后台线程点不动。
 * 运行中如果无障碍或通知使用权没了，就停下来，不再点屏幕。
 */

var WECHAT = "com.tencent.mm";
var pendingUntil = 0;

function waitAccessibility() {
    var i = 0;
    while (!auto.service && i < 90) {
        sleep(1000);
        i++;
    }
    auto.waitFor();
}

waitAccessibility();

// 跑起来之后如果无障碍或通知使用权没了，就停下来，不再点屏幕。
var answerTimer = null;
var accessHost = null;
var accessGuard = null;
var accessWatchReady = false;
try {
    var accessWatchFile = files.join(files.cwd(), "access-watch.js");
    if (!files.exists(accessWatchFile)) {
        accessWatchFile = files.join("/sdcard/脚本", "access-watch.js");
    }
    if (!files.exists(accessWatchFile)) {
        throw new Error("missing access-watch.js");
    }
    eval(files.read(accessWatchFile));
    accessWatchReady = typeof AccessWatch !== "undefined" && !!AccessWatch.createGuard && !!AccessWatch.gate;
} catch (accessWatchError) {
    accessWatchReady = false;
}
if (accessWatchReady !== true) {
    try {
        toast("自动接听已经停了。找不到用来确认无障碍和通知使用权的文件，平板不会再点屏幕。请让家人把 access-watch.js 和接听脚本放在同一个文件夹，再重新运行。");
    } catch (accessWatchToastError) {}
    exit();
}
accessHost = AccessWatch.createAndroidHost();
accessGuard = AccessWatch.createGuard({
    onStop: function (decision) {
        pendingUntil = 0;
        try {
            clearInterval(answerTimer);
        } catch (clearTimerError) {}
        try {
            AccessWatch.showLostAccess(decision);
        } catch (showLostError) {
            try {
                toast(AccessWatch.FALLBACK_MESSAGE);
            } catch (fallbackToastError) {}
        }
        try {
            exit();
        } catch (exitError) {}
    },
});

function accessStillAllows() {
    var snapshot;
    try {
        snapshot = AccessWatch.readSnapshot(accessHost);
    } catch (readError) {
        snapshot = AccessWatch.unknownSnapshot();
    }
    try {
        return AccessWatch.gate(accessGuard, snapshot, function () {
            return true;
        }) === true;
    } catch (gateError) {
        pendingUntil = 0;
        return false;
    }
}

function str(v) {
    if (v == null) {
        return "";
    }
    return "" + v;
}

function noteText(n) {
    var s = str(n.getTitle()) + " " + str(n.getText());
    try {
        s += " " + str(n.tickerText);
    } catch (e) {}
    return s;
}

function isCallText(s) {
    if (!s) {
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
    if (!accessStillAllows()) {
        return false;
    }
    if (!node) {
        return false;
    }
    try {
        if (node.click()) {
            return true;
        }
    } catch (e) {}
    if (!accessStillAllows()) {
        return false;
    }
    try {
        var b = node.bounds();
        if (b) {
            click(b.centerX(), b.centerY());
            return true;
        }
    } catch (e2) {}
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
    if (!accessStillAllows()) {
        return null;
    }
    try {
        if (click("接听")) {
            return true;
        }
    } catch (e) {}
    return null;
}

function findHangup() {
    return firstDescOrText("挂断") || firstDescOrText("拒绝") || firstDescOrText("取消");
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
        if (c && str(c.text()).indexOf("未接") < 0) {
            return c;
        }
    } catch (e) {}
    return null;
}

function clickAnswerByPosition() {
    if (!accessStillAllows()) {
        return false;
    }
    if (!findHangup()) {
        return false;
    }
    var w = device.width;
    var h = device.height;
    if (!accessStillAllows()) {
        return false;
    }
    click(w * 0.75, h * 0.82);
    sleep(200);
    if (!accessStillAllows()) {
        return false;
    }
    click(w * 0.78, h * 0.88);
    sleep(200);
    if (!accessStillAllows()) {
        return false;
    }
    click(w * 0.70, h * 0.80);
    return true;
}

function turnOnSpeaker() {
    var n = firstDescOrText("扬声器已关");
    if (n) {
        clickNode(n);
    }
}

function wakeAndOpenWeChat(n) {
    if (!accessStillAllows()) {
        return;
    }
    try {
        if (!device.isScreenOn()) {
            device.wakeUp();
            sleep(500);
        }
    } catch (e) {}
    if (!accessStillAllows()) {
        return;
    }
    try {
        if (n) {
            n.click();
        }
    } catch (e2) {}
    if (!accessStillAllows()) {
        return;
    }
    try {
        app.launchApp("微信");
    } catch (e) {}
    try {
        app.launchPackage(WECHAT);
    } catch (e) {}
    try {
        app.startActivity({
            packageName: WECHAT,
            className: "com.tencent.mm.ui.LauncherUI",
        });
    } catch (e) {}
}

function tryAnswerOnce() {
    if (!accessStillAllows()) {
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
    if (!accessStillAllows()) {
        return;
    }
    try {
        if (!n) {
            return;
        }
        var pkg = str(n.getPackageName());
        if (pkg !== WECHAT) {
            return;
        }
        var t = noteText(n);
        if (!isCallText(t)) {
            return;
        }
        if (!accessStillAllows()) {
            return;
        }
        toast("检测到微信来电，正在接听");
        pendingUntil = Date.now() + 20000;
        wakeAndOpenWeChat(n);
    } catch (e) {
        log(e);
    }
}

if (accessStillAllows()) {
    try {
        events.observeNotification();
    } catch (e) {
        toast("请打开通知使用权：关掉再打开 AutoJs6 那一项");
        try {
            app.startActivity({
                action: "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS",
            });
        } catch (e2) {}
    }

    events.onNotification(function (n) {
        onMaybeCall(n);
    });
    events.on("notification", function (n) {
        onMaybeCall(n);
    });

    answerTimer = setInterval(function () {
        try {
            tryAnswerOnce();
        } catch (e) {
            log(e);
        }
    }, 400);

    toast("全屏自动接听运行中");
    log("wechat auto-answer started");
}
