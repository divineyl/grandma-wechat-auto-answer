const test = require("node:test");
const assert = require("node:assert/strict");
const AccessWatch = require("../autox/access-watch.js");

const BANNED = /\b(permission|AppOps|listener|accessibility|SDK|API|exception|null|boolean|stack|click|swipe)\b/i;

function healthy(extra) {
    const snapshot = {
        accessibilityServiceConnected: true,
        accessibilitySettingEnabled: true,
        notificationListenerEnabled: true,
    };
    if (extra) {
        Object.keys(extra).forEach(function (key) {
            snapshot[key] = extra[key];
        });
    }
    return snapshot;
}

function ids(decision) {
    return decision.problems.map(function (item) {
        return item.id + ":" + item.kind;
    });
}

function assertStopped(decision, id, kind, snippet) {
    assert.equal(decision.ok, false);
    assert.ok(ids(decision).indexOf(id + ":" + kind) >= 0, ids(decision).join(","));
    assert.match(decision.message, /自动接听已经停了/);
    assert.match(decision.message, /不会再点屏幕/);
    assert.match(decision.message, /不会去猜按钮在哪里/);
    assert.match(decision.message, new RegExp(snippet));
    assert.doesNotMatch(decision.message, BANNED);
    assert.equal(
        JSON.stringify(Object.keys(decision).sort()),
        JSON.stringify(["message", "ok", "problems", "settingsAction"])
    );
}

function makeHost() {
    const data = {
        secureInt: { accessibility_enabled: 1 },
        secureString: {
            enabled_accessibility_services: "org.autojs.autojs6/org.autojs.autojs6.AccessibilityService",
            enabled_notification_listeners: "org.autojs.autojs6/org.autojs.autojs6.NotificationListener",
        },
        packageName: "org.autojs.autojs6",
        serviceConnected: true,
    };
    const calls = [];
    const host = {
        getSecureInt: function (name, def) {
            calls.push(["getSecureInt", name, def]);
            if (!Object.prototype.hasOwnProperty.call(data.secureInt, name)) {
                return def;
            }
            return data.secureInt[name];
        },
        getSecureString: function (name) {
            calls.push(["getSecureString", name]);
            if (!Object.prototype.hasOwnProperty.call(data.secureString, name)) {
                return null;
            }
            return data.secureString[name];
        },
        myPackageName: function () {
            calls.push(["myPackageName"]);
            if (!data.packageName) {
                throw new Error("missing package");
            }
            return data.packageName;
        },
        accessibilityServiceConnected: function () {
            calls.push(["accessibilityServiceConnected"]);
            if (data.serviceThrows) {
                throw new Error("service read failed");
            }
            return data.serviceConnected;
        },
    };
    return { data: data, calls: calls, host: host };
}

function screen() {
    return { clicks: [], guesses: [], swipes: [], pendingUntil: 0, wakes: 0 };
}

function runAnswerTick(guard, snapshot, ui) {
    if (AccessWatch.gate(guard, snapshot, function () { return true; }) !== true) {
        return;
    }
    AccessWatch.gate(guard, snapshot, function () {
        ui.clicks.push("banner");
    });
    AccessWatch.gate(guard, snapshot, function () {
        ui.clicks.push("answer");
    });
    if (ui.pendingUntil > 0) {
        AccessWatch.gate(guard, snapshot, function () {
            ui.guesses.push("corner");
        });
    }
    AccessWatch.gate(guard, snapshot, function () {
        ui.clicks.push("speaker");
    });
}

function onIncoming(guard, snapshot, ui) {
    if (AccessWatch.gate(guard, snapshot, function () { return true; }) !== true) {
        return;
    }
    ui.pendingUntil = 20000;
    ui.wakes += 1;
    AccessWatch.gate(guard, snapshot, function () {
        ui.clicks.push("notification");
    });
}

test("pass: a healthy snapshot may keep answering", function () {
    const decision = AccessWatch.evaluateAccess(healthy());
    assert.equal(decision.ok, true);
    assert.deepEqual(decision.problems, []);
    assert.equal(decision.message, "");
    assert.equal(decision.settingsAction, null);
});

test("pass: the secure settings for this package count as still on", function () {
    const box = makeHost();
    const decision = AccessWatch.resolveAccess(box.host);
    assert.equal(decision.ok, true, decision.message);
    assert.ok(box.calls.some(function (item) { return item[1] === "accessibility_enabled"; }));
    assert.ok(box.calls.some(function (item) { return item[1] === "enabled_accessibility_services"; }));
    assert.ok(box.calls.some(function (item) { return item[1] === "enabled_notification_listeners"; }));
});

test("pass: a Java-style true from the service still counts as connected", function () {
    const box = makeHost();
    box.data.serviceConnected = "true";
    assert.equal(AccessWatch.resolveAccess(box.host).ok, true);
});

test("fail: accessibility service dropped", function () {
    const decision = AccessWatch.evaluateAccess(healthy({
        accessibilityServiceConnected: false,
    }));
    assertStopped(decision, "accessibility", "off", "无障碍被关掉了");
    assert.equal(decision.settingsAction, AccessWatch.ACCESSIBILITY_SETTINGS);
    assert.doesNotMatch(decision.message, /通知使用权被关掉/);
});

test("fail: accessibility switch is off even if the service object is still there", function () {
    const decision = AccessWatch.evaluateAccess(healthy({
        accessibilitySettingEnabled: false,
    }));
    assertStopped(decision, "accessibility", "off", "无障碍被关掉了");
    assert.equal(decision.settingsAction, AccessWatch.ACCESSIBILITY_SETTINGS);
});

test("fail: accessibility switch read is uncertain", function () {
    const decision = AccessWatch.evaluateAccess(healthy({
        accessibilitySettingEnabled: "unknown",
    }));
    assertStopped(decision, "accessibility", "uncertain", "没能确认无障碍是不是还开着");
    assert.equal(decision.settingsAction, AccessWatch.ACCESSIBILITY_SETTINGS);
});

test("fail: a dropped service is reported as off even if the switch read failed", function () {
    const decision = AccessWatch.evaluateAccess(healthy({
        accessibilityServiceConnected: false,
        accessibilitySettingEnabled: "unknown",
    }));
    assertStopped(decision, "accessibility", "off", "无障碍被关掉了");
    assert.doesNotMatch(decision.message, /没能确认无障碍/);
});

test("fail: notification listener was turned off", function () {
    const decision = AccessWatch.evaluateAccess(healthy({
        notificationListenerEnabled: false,
    }));
    assertStopped(decision, "notification_listener", "off", "通知使用权被关掉了");
    assert.match(decision.message, /通知监听/);
    assert.equal(decision.settingsAction, AccessWatch.NOTIFICATION_SETTINGS);
});

test("fail: notification listener cannot be confirmed", function () {
    const decision = AccessWatch.evaluateAccess(healthy({
        notificationListenerEnabled: "unknown",
    }));
    assertStopped(decision, "notification_listener", "uncertain", "没能确认通知使用权是不是还开着");
    assert.equal(decision.settingsAction, AccessWatch.NOTIFICATION_SETTINGS);
});

test("fail: both signals lost names both and does not open one settings page", function () {
    const decision = AccessWatch.evaluateAccess(healthy({
        accessibilityServiceConnected: false,
        accessibilitySettingEnabled: false,
        notificationListenerEnabled: false,
    }));
    assertStopped(decision, "accessibility", "off", "无障碍被关掉了");
    assertStopped(decision, "notification_listener", "off", "通知使用权也被关掉了");
    assert.equal(decision.settingsAction, null);
});

test("fail: both signals unreadable use one combined sentence", function () {
    const decision = AccessWatch.evaluateAccess(AccessWatch.unknownSnapshot());
    assertStopped(decision, "accessibility", "uncertain", "没能确认无障碍和通知使用权是不是还开着");
    assertStopped(decision, "notification_listener", "uncertain", "没能确认无障碍和通知使用权是不是还开着");
    assert.equal(decision.settingsAction, null);
    assert.match(decision.message, /打开并确认/);
});

test("fail: missing fields and a missing snapshot are uncertain", function () {
    assert.equal(AccessWatch.evaluateAccess({}).ok, false);
    assert.equal(AccessWatch.evaluateAccess(null).ok, false);
    assert.match(AccessWatch.evaluateAccess(null).message, /已经停了/);
    assert.equal(AccessWatch.evaluateAccess(healthy({
        accessibilityServiceConnected: 1,
        accessibilitySettingEnabled: "yes",
    })).ok, false);
});

test("device read: master switch 0 is off without treating a stale service as enough", function () {
    const box = makeHost();
    box.data.secureInt.accessibility_enabled = 0;
    box.data.serviceConnected = true;
    const decision = AccessWatch.resolveAccess(box.host);
    assertStopped(decision, "accessibility", "off", "无障碍被关掉了");
});

test("device read: our package missing from the listener list is off", function () {
    const box = makeHost();
    box.data.secureString.enabled_notification_listeners = "com.other.app/com.other.app.Listener";
    const decision = AccessWatch.resolveAccess(box.host);
    assertStopped(decision, "notification_listener", "off", "通知使用权被关掉了");
});

test("device read: null listener setting is off, a thrown read is uncertain", function () {
    const missing = makeHost();
    missing.data.secureString.enabled_notification_listeners = null;
    assert.equal(AccessWatch.resolveAccess(missing.host).ok, false);
    assert.match(AccessWatch.resolveAccess(missing.host).message, /通知使用权被关掉了/);

    const broken = makeHost();
    broken.host.getSecureString = function (name) {
        if (name === "enabled_notification_listeners") {
            throw new Error("denied");
        }
        return missing.host.getSecureString(name);
    };
    const decision = AccessWatch.resolveAccess(broken.host);
    assertStopped(decision, "notification_listener", "uncertain", "没能确认通知使用权是不是还开着");
    assert.equal(decision.problems.length, 1);
});

test("device read: a thrown service check is uncertain and does not throw", function () {
    const box = makeHost();
    box.data.serviceThrows = true;
    const decision = AccessWatch.resolveAccess(box.host);
    assertStopped(decision, "accessibility", "uncertain", "没能确认无障碍是不是还开着");
});

test("device read: an empty package name is uncertain, not a false off", function () {
    const box = makeHost();
    box.data.packageName = "";
    const decision = AccessWatch.resolveAccess(box.host);
    assert.equal(decision.ok, false);
    assert.match(decision.message, /没能确认无障碍和通知使用权是不是还开着/);
});

test("device read: no host and a host without Android both refuse", function () {
    assert.equal(AccessWatch.resolveAccess(null).ok, false);
    assert.match(AccessWatch.resolveAccess(null).message, /没能确认无障碍和通知使用权是不是还开着/);
    const decision = AccessWatch.resolveAccess(AccessWatch.createAndroidHost());
    assert.equal(decision.ok, false);
    assert.match(decision.message, /已经停了/);
    assert.doesNotMatch(decision.message, BANNED);
});

test("component list matches this package and not a longer name", function () {
    const includes = AccessWatch.componentListIncludesPackage;
    assert.equal(includes(null, "org.autojs.autojs6"), false);
    assert.equal(includes("", "org.autojs.autojs6"), false);
    assert.equal(includes("org.autojs.autojs6/com.example.Service", "org.autojs.autojs6"), true);
    assert.equal(includes("com.other/foo:org.autojs.autojs6/bar", "org.autojs.autojs6"), true);
    assert.equal(includes("org.autojs.autojs6x/bar", "org.autojs.autojs6"), false);
    assert.equal(includes(" org.autojs.autojs6/bar ", "org.autojs.autojs6"), true);
    assert.equal(includes("org.autojs.autojs6", "org.autojs.autojs6"), true);
    assert.equal(includes("com.other/org.autojs.autojs6", "org.autojs.autojs6"), false);
});

test("after one healthy check, a dropped listener does not click, swipe, or guess", function () {
    const stops = [];
    const guard = AccessWatch.createGuard({
        onStop: function (decision) {
            stops.push(decision);
        },
    });
    const ui = screen();
    runAnswerTick(guard, healthy(), ui);
    assert.deepEqual(ui.clicks, ["banner", "answer", "speaker"]);
    assert.deepEqual(ui.guesses, []);
    assert.deepEqual(ui.swipes, []);

    ui.pendingUntil = 20000;
    runAnswerTick(guard, healthy({ notificationListenerEnabled: false }), ui);
    assert.deepEqual(ui.clicks, ["banner", "answer", "speaker"]);
    assert.deepEqual(ui.guesses, []);
    assert.deepEqual(ui.swipes, []);
    assert.equal(stops.length, 1);
    assert.match(stops[0].message, /通知使用权被关掉了/);
    assert.match(stops[0].message, /自动接听已经停了/);

    runAnswerTick(guard, healthy(), ui);
    onIncoming(guard, healthy(), ui);
    assert.equal(ui.wakes, 0);
    assert.deepEqual(ui.clicks, ["banner", "answer", "speaker"]);
    assert.equal(stops.length, 1);
    assert.equal(guard.isStopped(), true);
});

test("a lost signal clears an armed guess window and does not tap the notification", function () {
    const state = screen();
    state.pendingUntil = 20000;
    const guard = AccessWatch.createGuard({
        onStop: function () {
            state.pendingUntil = 0;
        },
    });
    onIncoming(guard, healthy({ accessibilityServiceConnected: false }), state);
    assert.equal(state.pendingUntil, 0);
    assert.equal(state.wakes, 0);
    assert.deepEqual(state.clicks, []);
    assert.deepEqual(state.guesses, []);
    AccessWatch.gate(guard, healthy(), function () {
        state.guesses.push("corner");
    });
    assert.deepEqual(state.guesses, []);
});

test("an uncertain read does not run the tap callback", function () {
    let taps = 0;
    const guard = AccessWatch.createGuard({ onStop: function () {} });
    const allowed = AccessWatch.gate(guard, healthy({
        notificationListenerEnabled: "unknown",
    }), function () {
        taps += 1;
        return "tapped";
    });
    assert.equal(allowed, false);
    assert.equal(taps, 0);
    assert.equal(AccessWatch.gate(null, healthy(), function () {
        taps += 1;
    }), false);
    assert.equal(taps, 0);
});

test("stopping tells the family once, and a broken dialog still leaves the words", function () {
    const decision = AccessWatch.evaluateAccess(healthy({
        accessibilityServiceConnected: false,
    }));
    const ui = {
        logs: [],
        alerts: [],
        toasts: [],
        opened: [],
        log: function (message) { this.logs.push(message); },
        alert: function (title, message) { this.alerts.push([title, message]); },
        toast: function (message) { this.toasts.push(message); },
        openSettings: function (target) { this.opened.push(target); },
    };
    AccessWatch.showLostAccess(decision, ui);
    assert.equal(ui.alerts.length, 1);
    assert.equal(ui.alerts[0][0], "自动接听已经停了");
    assert.match(ui.alerts[0][1], /无障碍被关掉了/);
    assert.equal(ui.logs[0], decision.message);
    assert.deepEqual(ui.opened, [{ action: AccessWatch.ACCESSIBILITY_SETTINGS }]);
    assert.equal(ui.toasts.length, 0);

    const both = AccessWatch.evaluateAccess(healthy({
        accessibilitySettingEnabled: false,
        notificationListenerEnabled: false,
    }));
    const uiBoth = {
        alerts: [],
        opened: [],
        log: function () {},
        alert: function (title, message) { this.alerts.push(message); },
        toast: function () {},
        openSettings: function (target) { this.opened.push(target); },
    };
    AccessWatch.showLostAccess(both, uiBoth);
    assert.equal(uiBoth.opened.length, 0);
    assert.match(uiBoth.alerts[0], /无障碍/);
    assert.match(uiBoth.alerts[0], /通知使用权/);

    const broken = {
        toasts: [],
        opened: [],
        log: function () { throw new Error("log"); },
        alert: function () { throw new Error("alert"); },
        toast: function (message) { this.toasts.push(message); },
        openSettings: function (target) { this.opened.push(target); },
    };
    assert.doesNotThrow(function () {
        AccessWatch.showLostAccess(decision, broken);
    });
    assert.equal(broken.toasts.length, 1);
    assert.match(broken.toasts[0], /自动接听已经停了/);
    assert.equal(broken.opened.length, 1);

    const exploding = {
        log: function () { throw new Error("log"); },
        alert: function () { throw new Error("alert"); },
        toast: function () { throw new Error("toast"); },
        openSettings: function () { throw new Error("settings"); },
    };
    assert.doesNotThrow(function () {
        AccessWatch.showLostAccess(decision, exploding);
        AccessWatch.showLostAccess(null, exploding);
    });
});

test("a guard whose stop handler throws still stays stopped and does not tap", function () {
    let taps = 0;
    const guard = AccessWatch.createGuard({
        onStop: function () {
            throw new Error("dialog failed");
        },
    });
    assert.equal(AccessWatch.gate(guard, healthy({ notificationListenerEnabled: false }), function () {
        taps += 1;
    }), false);
    assert.equal(taps, 0);
    assert.equal(guard.isStopped(), true);
    assert.equal(AccessWatch.gate(guard, healthy(), function () {
        taps += 1;
    }), false);
    assert.equal(taps, 0);
});

test("the watch module does not tap, guess a coordinate, or treat chat text as a call", function () {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../autox/access-watch.js"), "utf8");
    assert.equal(src.indexOf("click("), -1);
    assert.equal(src.indexOf("swipe("), -1);
    assert.equal(src.indexOf("press("), -1);
    assert.equal(src.indexOf("gesture("), -1);
    assert.equal(src.indexOf("0.75"), -1);
    assert.equal(src.indexOf("0.82"), -1);
    assert.equal(src.indexOf("视频通话"), -1);
    assert.equal(src.indexOf("语音通话"), -1);
    assert.equal(src.indexOf("发送"), -1);
    assert.equal(src.indexOf("邀请你"), -1);
});
