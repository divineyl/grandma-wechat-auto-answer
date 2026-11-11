/**
 * 微信来电自动全屏接听（AutoJs6）
 *
 * 安全开关在文件最上面。出厂是关闭的，不会点屏幕。
 * 只在家人知情的专用平板上，把 AUTO_ANSWER_ENABLED 改成 true。
 * 脚本只点微信里这几类字：接听、短的「邀请你…通话」、扬声器已关。
 * 看见「发送」就停手。不按坐标乱点，避免点到发送或挂断。
 */

// true 才会接听。必须写成布尔值，不能写成 "true"。
var AUTO_ANSWER_ENABLED = false;

// 空名单：开启后会接听所有微信语音/视频来电。
// 只接某几个人时写成 ["妈妈", "爸爸"]，要和通知或来电画面上的名字一致。
// 不要把真实昵称提交回仓库。写错类型（比如写成字符串）时，脚本不会接听。
var ALLOW_CALLER_NAMES = [];

var WECHAT = "com.tencent.mm";
var INVITE_VIDEO = "邀请你视频通话";
var INVITE_VOICE = "邀请你语音通话";
var ENDED_MARKS = ["未接", "已结束", "已取消", "已拒绝", "已挂断", "通话时长", "对方已取消"];
var ANSWER_LABELS = ["接听", "接听通话", "接听视频"];
var DECLINE_LABELS = ["挂断", "拒绝"];

var pendingUntil = 0;
var pendingCallerOk = false;
var lastToastAt = 0;
var clickCount = 0;
var holdClicks = false;
var speakerTried = false;

function str(v) {
    if (v == null) {
        return "";
    }
    return "" + v;
}

function trim(v) {
    return str(v).replace(/^\s+|\s+$/g, "");
}

function isNameList(value) {
    return !!value && typeof value !== "string" && typeof value.length === "number";
}

function allowedNames() {
    if (!isNameList(ALLOW_CALLER_NAMES)) {
        return null;
    }
    var out = [];
    var i;
    for (i = 0; i < ALLOW_CALLER_NAMES.length; i++) {
        var name = trim(ALLOW_CALLER_NAMES[i]);
        if (name) {
            out.push(name);
        }
    }
    return out;
}

function callerAllowed(text) {
    var names = allowedNames();
    if (names === null) {
        return false;
    }
    if (!names.length) {
        return true;
    }
    var blob = str(text);
    var i;
    for (i = 0; i < names.length; i++) {
        if (blob.indexOf(names[i]) >= 0) {
            return true;
        }
    }
    return false;
}

function hasEndedMark(s) {
    var i;
    for (i = 0; i < ENDED_MARKS.length; i++) {
        if (s.indexOf(ENDED_MARKS[i]) >= 0) {
            return true;
        }
    }
    return false;
}

function isCallText(s) {
    s = str(s);
    if (!s || hasEndedMark(s)) {
        return false;
    }
    if (s.indexOf(INVITE_VIDEO) >= 0 || s.indexOf(INVITE_VOICE) >= 0) {
        return true;
    }
    return false;
}

function toastSoon(message) {
    var now = Date.now();
    if (now - lastToastAt < 8000) {
        return;
    }
    lastToastAt = now;
    toast(message);
}

function noteText(n) {
    var s = str(n.getTitle()) + " " + str(n.getText());
    try {
        s += " " + str(n.tickerText);
    } catch (e) {}
    return s;
}

function nodeText(node) {
    var s = "";
    try {
        s += str(node.text());
    } catch (e) {}
    try {
        s += " " + str(node.desc());
    } catch (e2) {}
    return s;
}

function nodePkg(node) {
    try {
        return str(node.packageName());
    } catch (e) {
        return "";
    }
}

function boundsOf(node) {
    try {
        return node.bounds();
    } catch (e) {
        return null;
    }
}

function sizeOf(b) {
    var w = 0;
    var h = 0;
    try {
        w = b.width();
    } catch (e) {
        w = b.right - b.left;
    }
    try {
        h = b.height();
    } catch (e2) {
        h = b.bottom - b.top;
    }
    return { w: w, h: h };
}

function centerInScreen(b) {
    try {
        var x = b.centerX();
        var y = b.centerY();
        return x >= 1 && y >= 1 && x < device.width && y < device.height;
    } catch (e) {
        return false;
    }
}

function labelIs(node, expected) {
    var text = "";
    var desc = "";
    try {
        text = trim(node.text());
    } catch (e) {}
    try {
        desc = trim(node.desc());
    } catch (e2) {}
    return text === expected || desc === expected;
}

function isAnswerLabel(node) {
    var i;
    for (i = 0; i < ANSWER_LABELS.length; i++) {
        if (labelIs(node, ANSWER_LABELS[i])) {
            return true;
        }
    }
    return false;
}

function isShortInvitation(node) {
    var s = trim(nodeText(node));
    if (!s || s.length > 24 || hasEndedMark(s)) {
        return false;
    }
    if (s.indexOf(INVITE_VIDEO) < 0 && s.indexOf(INVITE_VOICE) < 0) {
        return false;
    }
    return true;
}

function isSpeakerOff(node) {
    return labelIs(node, "扬声器已关");
}

function boundsOk(node, kind) {
    var b = boundsOf(node);
    if (!b || !centerInScreen(b)) {
        return false;
    }
    var size = sizeOf(b);
    if (size.w <= 0 || size.h <= 0) {
        return false;
    }
    if (size.w > device.width * 0.92 || size.h > device.height * 0.45) {
        return false;
    }
    if (kind === "invite") {
        return size.h >= 12;
    }
    return size.w >= 36 && size.h >= 36;
}

function canClickNode(node, kind) {
    if (!node) {
        return false;
    }
    if (nodePkg(node) !== WECHAT) {
        return false;
    }
    if (nodeText(node).indexOf("发送") >= 0) {
        return false;
    }
    if (kind === "answer" && isAnswerLabel(node) && boundsOk(node, kind)) {
        return true;
    }
    if (kind === "invite" && isShortInvitation(node) && boundsOk(node, kind)) {
        return true;
    }
    if (kind === "speaker" && isSpeakerOff(node) && boundsOk(node, kind)) {
        return true;
    }
    return false;
}

function clickNode(node, kind) {
    if (!canClickNode(node, kind)) {
        return false;
    }
    try {
        if (node.click()) {
            return true;
        }
    } catch (e) {}
    try {
        var b = boundsOf(node);
        if (!b || !centerInScreen(b)) {
            return false;
        }
        click(b.centerX(), b.centerY());
        return true;
    } catch (e2) {}
    return false;
}

function collectionSize(nodes) {
    if (!nodes) {
        return 0;
    }
    try {
        return nodes.size();
    } catch (e) {}
    try {
        return nodes.length;
    } catch (e2) {}
    return 0;
}

function collectionAt(nodes, index) {
    try {
        return nodes.get(index);
    } catch (e) {}
    try {
        return nodes[index];
    } catch (e2) {}
    return null;
}

function firstMatching(nodes, accept) {
    var n = collectionSize(nodes);
    var i;
    for (i = 0; i < n; i++) {
        var node = collectionAt(nodes, i);
        if (accept(node)) {
            return node;
        }
    }
    return null;
}

function findByQuery(kind, value, accept) {
    var found = null;
    try {
        var byDesc = kind === "contains" ? packageName(WECHAT).descContains(value).find() : packageName(WECHAT).desc(value).find();
        found = firstMatching(byDesc, accept);
    } catch (e) {}
    if (found) {
        return found;
    }
    try {
        var byText = kind === "contains" ? packageName(WECHAT).textContains(value).find() : packageName(WECHAT).text(value).find();
        found = firstMatching(byText, accept);
    } catch (e2) {}
    return found;
}

function findAnswer() {
    var i;
    for (i = 0; i < ANSWER_LABELS.length; i++) {
        var node = findByQuery("exact", ANSWER_LABELS[i], function (item) {
            return canClickNode(item, "answer");
        });
        if (node) {
            return node;
        }
    }
    return null;
}

function findDecline() {
    var i;
    for (i = 0; i < DECLINE_LABELS.length; i++) {
        var node = findByQuery("exact", DECLINE_LABELS[i], function (item) {
            return item && labelIs(item, DECLINE_LABELS[i]) && nodePkg(item) === WECHAT && boundsOk(item, "answer");
        });
        if (node) {
            return node;
        }
    }
    return null;
}

function findInvitation() {
    var phrases = [INVITE_VIDEO, INVITE_VOICE];
    var i;
    for (i = 0; i < phrases.length; i++) {
        var node = findByQuery("contains", phrases[i], function (item) {
            return canClickNode(item, "invite");
        });
        if (node) {
            return node;
        }
    }
    return null;
}

function sendButtonVisible() {
    var node = findByQuery("exact", "发送", function (item) {
        return item && labelIs(item, "发送") && nodePkg(item) === WECHAT && boundsOk(item, "answer");
    });
    return !!node;
}

function screenHasAllowedCaller() {
    var names = allowedNames();
    if (names === null) {
        return false;
    }
    if (!names.length) {
        return true;
    }
    // 名单不为空时，只相信刚收到的那条来电通知，不在聊天列表里找同名。
    return pendingCallerOk && Date.now() < pendingUntil;
}

function turnOnSpeaker() {
    var node = findByQuery("exact", "扬声器已关", function (item) {
        return canClickNode(item, "speaker");
    });
    if (node) {
        clickNode(node, "speaker");
    }
}

function wakeAndOpenWeChat(n) {
    try {
        if (!device.isScreenOn()) {
            device.wakeUp();
            sleep(500);
        }
    } catch (e) {}
    try {
        if (n) {
            n.click();
        }
    } catch (e2) {}
    try {
        app.launchApp("微信");
    } catch (e3) {}
    try {
        app.launchPackage(WECHAT);
    } catch (e4) {}
    try {
        app.startActivity({
            packageName: WECHAT,
            className: "com.tencent.mm.ui.LauncherUI",
        });
    } catch (e5) {}
}

function releaseHoldIfIdle(hasWork) {
    if (hasWork) {
        return false;
    }
    clickCount = 0;
    holdClicks = false;
    speakerTried = false;
    return true;
}

function rememberClick() {
    clickCount++;
    if (clickCount >= 2) {
        holdClicks = true;
    }
}

function tryAnswerOnce() {
    if (AUTO_ANSWER_ENABLED !== true || allowedNames() === null) {
        return false;
    }
    if (!auto.service) {
        toastSoon("无障碍被关掉了，请重新打开 AutoJs6");
        return false;
    }
    var answer = findAnswer();
    var decline = findDecline();
    var inWindow = Date.now() < pendingUntil;
    var callScreen = !!(answer && decline);
    if (sendButtonVisible() && (inWindow || callScreen)) {
        toastSoon("看见发送按钮，为避免发出消息，这次不自动接听");
        return false;
    }
    if ((inWindow || callScreen) && !screenHasAllowedCaller()) {
        toastSoon("有微信来电，但不在接听名单里，已忽略");
        return false;
    }
    var invite = inWindow ? findInvitation() : null;
    var hasWork = !!(answer && decline) || !!invite;
    if (releaseHoldIfIdle(hasWork) || holdClicks) {
        return false;
    }
    if (answer && decline) {
        if (clickNode(answer, "answer")) {
            rememberClick();
            if (!speakerTried) {
                speakerTried = true;
                sleep(800);
                turnOnSpeaker();
            }
            toast("已点接听");
            return true;
        }
        return false;
    }
    if (invite && clickNode(invite, "invite")) {
        rememberClick();
        sleep(400);
    }
    return false;
}

function onMaybeCall(n) {
    try {
        if (AUTO_ANSWER_ENABLED !== true || !n || allowedNames() === null) {
            return;
        }
        if (str(n.getPackageName()) !== WECHAT) {
            return;
        }
        var text = noteText(n);
        if (!isCallText(text)) {
            return;
        }
        if (!callerAllowed(text)) {
            toastSoon("有微信来电，但不在接听名单里，已忽略");
            return;
        }
        toast("检测到微信来电，正在接听");
        pendingUntil = Date.now() + 20000;
        pendingCallerOk = true;
        clickCount = 0;
        holdClicks = false;
        speakerTried = false;
        wakeAndOpenWeChat(n);
    } catch (e) {
        log(e);
    }
}

function stopIfDuplicate() {
    try {
        var running = engines.all();
        var count = 0;
        var i;
        for (i = 0; i < running.length; i++) {
            var src = running[i].getSource();
            if (src && ("" + src).indexOf("auto-answer-fullscreen") >= 0) {
                count++;
            }
        }
        if (count > 1) {
            toast("已有一份接听脚本在运行。请先停止旧的，再运行，避免点两次");
            exit();
        }
    } catch (e) {}
}

function waitAccessibility() {
    var i = 0;
    while (!auto.service && i < 90) {
        sleep(1000);
        i++;
    }
    auto.waitFor();
}

function idleDisabled(message) {
    toast(message);
    setInterval(function () {}, 60000);
}

function startAnswerLoop() {
    waitAccessibility();
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
    setInterval(function () {
        try {
            tryAnswerOnce();
        } catch (e) {
            log(e);
        }
    }, 400);
    log("wechat auto-answer started");
}

// BEGIN SIDE EFFECTS
stopIfDuplicate();

if (AUTO_ANSWER_ENABLED !== true) {
    if (AUTO_ANSWER_ENABLED === false) {
        idleDisabled("自动接听未开启。这是安全默认。确认是家人专用平板后，把脚本里的 AUTO_ANSWER_ENABLED 改成 true，保存后再运行");
    } else {
        idleDisabled("AUTO_ANSWER_ENABLED 必须写成 true 或 false，不能加引号。当前不会接听");
    }
} else if (allowedNames() === null) {
    idleDisabled("接听名单写错了。请写成 []，或写成 [\"妈妈\", \"爸爸\"]。当前不会接听");
} else if (!allowedNames().length) {
    toast("自动接听已开启：将接听所有微信来电");
    startAnswerLoop();
} else {
    toast("自动接听已开启：只接听名单中的联系人");
    startAnswerLoop();
}
