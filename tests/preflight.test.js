const test = require("node:test");
const assert = require("node:assert/strict");
const Preflight = require("../autox/preflight.js");

const BANNED = /\b(permission|AppOps|listener|accessibility|SDK|API|exception|null|boolean|stack|click)\b/i;

function passingEnv(extra) {
    const env = {
        wechatInstalled: true,
        accessibilitySettingEnabled: true,
        accessibilityServiceConnected: false,
        notificationListenerEnabled: true,
        postNotifications: "not_required",
        wakeLock: "granted",
        canDrawOverlays: true,
        backgroundPopup: "unknown",
        ignoringBatteryOptimizations: true,
        powerSaveMode: false,
        wechatNotifications: "unknown",
        wechatCanDrawOverlays: "unknown",
        wechatBackgroundPopup: "unknown",
        wechatIgnoringBatteryOptimizations: true,
    };
    if (extra) {
        Object.keys(extra).forEach(function (key) {
            env[key] = extra[key];
        });
    }
    return env;
}

function texts(decision) {
    return decision.failures.map(function (item) {
        return item.text;
    }).join("\n");
}

function ids(decision) {
    return decision.failures.map(function (item) {
        return item.id;
    });
}

function makeHost() {
    const data = {
        secureInt: { accessibility_enabled: 1 },
        secureString: {
            enabled_accessibility_services: "org.autojs.autojs6/a.A",
            enabled_notification_listeners: "org.autojs.autojs6/a.N",
        },
        packageName: "org.autojs.autojs6",
        installed: { "com.tencent.mm": true },
        sdk: 34,
        permissions: {
            "android.permission.POST_NOTIFICATIONS": 0,
            "android.permission.WAKE_LOCK": 0,
        },
        overlays: true,
        ops: {},
        battery: {
            "org.autojs.autojs6": true,
            "com.tencent.mm": true,
        },
        powerSave: false,
        serviceConnected: true,
    };
    const calls = [];
    const host = {
        getPackageInfo: function (pkg) {
            calls.push(["getPackageInfo", pkg]);
            if (!data.installed[pkg]) {
                throw new Error("not found");
            }
            return { packageName: pkg };
        },
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
            return data.packageName;
        },
        accessibilityServiceConnected: function () {
            return data.serviceConnected;
        },
        sdkInt: function () {
            return data.sdk;
        },
        checkSelfPermission: function (name) {
            calls.push(["checkSelfPermission", name]);
            if (!Object.prototype.hasOwnProperty.call(data.permissions, name)) {
                return -1;
            }
            return data.permissions[name];
        },
        canDrawOverlays: function () {
            return data.overlays;
        },
        checkOp: function (op, pkg) {
            calls.push(["checkOp", op, pkg]);
            const key = String(op) + " " + pkg;
            if (!Object.prototype.hasOwnProperty.call(data.ops, key)) {
                return 3;
            }
            return data.ops[key];
        },
        ignoringBatteryOptimizations: function (pkg) {
            calls.push(["ignoringBatteryOptimizations", pkg]);
            if (!Object.prototype.hasOwnProperty.call(data.battery, pkg)) {
                throw new Error("battery unknown");
            }
            return data.battery[pkg];
        },
        powerSaveMode: function () {
            return data.powerSave;
        },
    };
    return { data: data, calls: calls, host: host };
}

function decideWith(mutate) {
    const box = makeHost();
    if (mutate) {
        mutate(box.data);
    }
    return {
        decision: Preflight.resolvePreflight(Preflight.createAndroidBridge(box.host)),
        calls: box.calls,
    };
}

function assertRefusal(decision, id, snippet) {
    assert.equal(decision.ok, false);
    assert.ok(ids(decision).indexOf(id) >= 0, ids(decision).join(","));
    assert.match(decision.summary, /还不能自动接听/);
    assert.match(texts(decision), new RegExp(snippet));
    assert.equal(JSON.stringify(Object.keys(decision).sort()), JSON.stringify(["failures", "ok", "summary"]));
    assert.doesNotMatch(texts(decision), BANNED);
}

test("pass: enables when every practical check succeeds", function () {
    const decision = Preflight.evaluatePreflight(passingEnv());
    assert.equal(decision.ok, true);
    assert.deepEqual(decision.failures, []);
    assert.equal(decision.summary, "");
    assert.equal(JSON.stringify(decision).indexOf("视频通话"), -1);
    assert.equal(JSON.stringify(decision).indexOf("发送"), -1);
    assert.equal(JSON.stringify(decision).indexOf("click"), -1);
});

test("pass: a not-yet-connected accessibility service does not block when the switch is on", function () {
    const decision = Preflight.evaluatePreflight(passingEnv({
        accessibilitySettingEnabled: true,
        accessibilityServiceConnected: false,
    }));
    assert.equal(decision.ok, true);
});

test("pass: a live accessibility service counts even if the setting read failed", function () {
    const decision = Preflight.evaluatePreflight(passingEnv({
        accessibilitySettingEnabled: "unknown",
        accessibilityServiceConnected: true,
    }));
    assert.equal(decision.ok, true);
});

test("pass: notification permission is not required before Android 13", function () {
    const result = decideWith(function (data) {
        data.sdk = 28;
        data.permissions["android.permission.POST_NOTIFICATIONS"] = -1;
    });
    assert.equal(result.decision.ok, true);
});

test("pass: unreported vendor background-popup does not block", function () {
    const decision = Preflight.evaluatePreflight(passingEnv({
        backgroundPopup: "unknown",
        wechatBackgroundPopup: "unknown",
        wechatNotifications: "unknown",
        wechatCanDrawOverlays: "unknown",
    }));
    assert.equal(decision.ok, true);
    assert.equal(Preflight.evaluatePreflight(passingEnv({ backgroundPopup: "allowed" })).ok, true);
});

test("fail: refuses when accessibility is off", function () {
    const decision = Preflight.evaluatePreflight(passingEnv({
        accessibilitySettingEnabled: false,
        accessibilityServiceConnected: false,
    }));
    assertRefusal(decision, "accessibility", "无障碍");
    assert.match(texts(decision), /没打开/);
    assert.equal(Preflight.settingsTargetFor(decision.failures).action, "android.settings.ACCESSIBILITY_SETTINGS");
});

test("fail: refuses when accessibility cannot be confirmed", function () {
    const decision = Preflight.evaluatePreflight(passingEnv({
        accessibilitySettingEnabled: "unknown",
        accessibilityServiceConnected: "unknown",
    }));
    assertRefusal(decision, "accessibility", "没能确认");
});

test("fail: refuses when notification access is off", function () {
    const decision = Preflight.evaluatePreflight(passingEnv({
        notificationListenerEnabled: false,
    }));
    assertRefusal(decision, "notification_listener", "通知使用权");
    assert.equal(
        Preflight.settingsTargetFor(decision.failures).action,
        "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"
    );
});

test("fail: refuses when notification access cannot be confirmed", function () {
    const decision = Preflight.evaluatePreflight(passingEnv({
        notificationListenerEnabled: "unknown",
    }));
    assertRefusal(decision, "notification_listener", "没能确认");
});

test("fail: refuses when Android 13 notification permission is denied", function () {
    const decision = Preflight.evaluatePreflight(passingEnv({
        postNotifications: "denied",
    }));
    assertRefusal(decision, "post_notifications", "通知");
    assert.equal(Preflight.settingsTargetFor(decision.failures), null);
});

test("fail: refuses when the screen cannot be woken", function () {
    assertRefusal(
        Preflight.evaluatePreflight(passingEnv({ wakeLock: "denied" })),
        "wake_lock",
        "点不亮屏幕"
    );
    assertRefusal(
        Preflight.evaluatePreflight(passingEnv({ wakeLock: "unknown" })),
        "wake_lock",
        "没能确认"
    );
});

test("fail: refuses when overlay is off or unreadable", function () {
    assertRefusal(
        Preflight.evaluatePreflight(passingEnv({ canDrawOverlays: false })),
        "overlay",
        "悬浮窗"
    );
    assertRefusal(
        Preflight.evaluatePreflight(passingEnv({ canDrawOverlays: "unknown" })),
        "overlay",
        "没能确认"
    );
});

test("fail: refuses when our background popup is explicitly denied", function () {
    const decision = Preflight.evaluatePreflight(passingEnv({ backgroundPopup: "denied" }));
    assertRefusal(decision, "background_popup", "后台弹出界面");
});

test("fail: refuses when battery policy is not unrestricted", function () {
    const off = Preflight.evaluatePreflight(passingEnv({ ignoringBatteryOptimizations: false }));
    assertRefusal(off, "battery", "无限制");
    assert.equal(
        Preflight.settingsTargetFor(off.failures).action,
        "android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS"
    );
    assertRefusal(
        Preflight.evaluatePreflight(passingEnv({ ignoringBatteryOptimizations: "unknown" })),
        "battery",
        "没能确认"
    );
});

test("fail: refuses when system power save is on or unreadable", function () {
    const on = Preflight.evaluatePreflight(passingEnv({ powerSaveMode: true }));
    assertRefusal(on, "power_save", "省电模式");
    assert.equal(
        Preflight.settingsTargetFor(on.failures).action,
        "android.settings.BATTERY_SAVER_SETTINGS"
    );
    assertRefusal(
        Preflight.evaluatePreflight(passingEnv({ powerSaveMode: "unknown" })),
        "power_save",
        "没能确认"
    );
});

test("fail: refuses when WeChat is missing", function () {
    const decision = Preflight.evaluatePreflight(passingEnv({
        wechatInstalled: false,
        wechatNotifications: "denied",
        wechatIgnoringBatteryOptimizations: false,
    }));
    assertRefusal(decision, "wechat_installed", "没有安装微信");
    assert.equal(ids(decision).indexOf("wechat_notifications"), -1);
    assert.equal(ids(decision).indexOf("wechat_battery"), -1);
});

test("fail: refuses when WeChat notifications, overlay, popup, or battery block calls", function () {
    assertRefusal(
        Preflight.evaluatePreflight(passingEnv({ wechatNotifications: "denied" })),
        "wechat_notifications",
        "微信的通知"
    );
    assertRefusal(
        Preflight.evaluatePreflight(passingEnv({ wechatCanDrawOverlays: "denied" })),
        "wechat_overlay",
        "微信的「显示悬浮窗」"
    );
    assertRefusal(
        Preflight.evaluatePreflight(passingEnv({ wechatBackgroundPopup: "denied" })),
        "wechat_background",
        "微信的「后台弹出界面」"
    );
    assertRefusal(
        Preflight.evaluatePreflight(passingEnv({ wechatIgnoringBatteryOptimizations: false })),
        "wechat_battery",
        "微信的省电策略"
    );
    assertRefusal(
        Preflight.evaluatePreflight(passingEnv({ wechatIgnoringBatteryOptimizations: "unknown" })),
        "wechat_battery",
        "没能确认微信的省电策略"
    );
});

test("fail: several problems are all explained and no single settings page is opened", function () {
    const decision = Preflight.evaluatePreflight(passingEnv({
        notificationListenerEnabled: false,
        canDrawOverlays: false,
        powerSaveMode: true,
        wechatInstalled: false,
    }));
    assert.equal(decision.ok, false);
    assert.deepEqual(ids(decision), [
        "wechat_installed",
        "notification_listener",
        "overlay",
        "power_save",
    ]);
    assert.match(decision.summary, /1\. /);
    assert.match(decision.summary, /4\. /);
    assert.equal(Preflight.settingsTargetFor(decision.failures), null);
    assert.doesNotMatch(texts(decision), BANNED);
});

test("fail: an empty reading refuses to enable", function () {
    const decision = Preflight.evaluatePreflight({});
    assert.equal(decision.ok, false);
    assert.match(decision.summary, /还不能自动接听，所以这次没有开启/);
    assert.match(texts(decision), /没有安装微信/);
    assert.doesNotMatch(texts(decision), BANNED);
});

test("fail: a bridge that throws is fail-closed", function () {
    const bridge = {};
    [
        "wechatInstalled",
        "accessibilitySettingEnabled",
        "accessibilityServiceConnected",
        "notificationListenerEnabled",
        "postNotifications",
        "wakeLock",
        "canDrawOverlays",
        "backgroundPopup",
        "ignoringBatteryOptimizations",
        "powerSaveMode",
        "wechatNotifications",
        "wechatCanDrawOverlays",
        "wechatBackgroundPopup",
        "wechatIgnoringBatteryOptimizations",
    ].forEach(function (name) {
        bridge[name] = function () {
            throw new Error(name);
        };
    });
    const env = Preflight.readPreflightEnv(bridge);
    assert.equal(env.wechatInstalled, false);
    assert.equal(env.accessibilitySettingEnabled, "unknown");
    assert.equal(env.notificationListenerEnabled, "unknown");
    assert.equal(env.backgroundPopup, "unknown");
    assert.equal(env.wakeLock, "unknown");
    const decision = Preflight.evaluatePreflight(env);
    assert.equal(decision.ok, false);
    assert.match(decision.summary, /还不能自动接听/);
});

test("fail: null probe results use the same safe fallback", function () {
    const bridge = {
        wechatInstalled: function () { return null; },
        accessibilitySettingEnabled: function () { return null; },
        accessibilityServiceConnected: function () { return null; },
        notificationListenerEnabled: function () { return null; },
        postNotifications: function () { return null; },
        wakeLock: function () { return null; },
        canDrawOverlays: function () { return null; },
        backgroundPopup: function () { return null; },
        ignoringBatteryOptimizations: function () { return null; },
        powerSaveMode: function () { return null; },
        wechatNotifications: function () { return null; },
        wechatCanDrawOverlays: function () { return null; },
        wechatBackgroundPopup: function () { return null; },
        wechatIgnoringBatteryOptimizations: function () { return null; },
    };
    const decision = Preflight.resolvePreflight(bridge);
    assert.equal(decision.ok, false);
});

test("pass: the Android bridge reads the settings this app actually needs", function () {
    const result = decideWith();
    assert.equal(result.decision.ok, true, texts(result.decision));
    const secureStrings = result.calls.filter(function (call) {
        return call[0] === "getSecureString";
    }).map(function (call) {
        return call[1];
    });
    const secureInts = result.calls.filter(function (call) {
        return call[0] === "getSecureInt";
    }).map(function (call) {
        return call[1];
    });
    const permissions = result.calls.filter(function (call) {
        return call[0] === "checkSelfPermission";
    }).map(function (call) {
        return call[1];
    });
    const ops = result.calls.filter(function (call) {
        return call[0] === "checkOp";
    });
    assert.ok(secureStrings.indexOf("enabled_accessibility_services") >= 0);
    assert.ok(secureStrings.indexOf("enabled_notification_listeners") >= 0);
    assert.ok(secureInts.indexOf("accessibility_enabled") >= 0);
    assert.ok(permissions.indexOf("android.permission.POST_NOTIFICATIONS") >= 0);
    assert.ok(permissions.indexOf("android.permission.WAKE_LOCK") >= 0);
    assert.ok(ops.some(function (call) {
        return call[1] === 10021 && call[2] === "org.autojs.autojs6";
    }));
    assert.ok(ops.some(function (call) {
        return call[1] === "android:post_notification" && call[2] === "com.tencent.mm";
    }));
    assert.ok(ops.some(function (call) {
        return call[1] === "android:system_alert_window" && call[2] === "com.tencent.mm";
    }));
    assert.ok(result.calls.some(function (call) {
        return call[0] === "getPackageInfo" && call[1] === "com.tencent.mm";
    }));
});

test("fail: the bridge refuses a real missing notification listener", function () {
    const result = decideWith(function (data) {
        data.secureString.enabled_notification_listeners = "org.autojs.autojs6x/a.N";
    });
    assertRefusal(result.decision, "notification_listener", "通知使用权");
    assert.equal(result.decision.failures.length, 1);
});

test("fail: the bridge refuses when accessibility is switched off", function () {
    const result = decideWith(function (data) {
        data.secureInt.accessibility_enabled = 0;
        data.serviceConnected = false;
    });
    assertRefusal(result.decision, "accessibility", "无障碍");
});

test("pass: the bridge still allows startup when the switch is on but the service is not bound yet", function () {
    const result = decideWith(function (data) {
        data.serviceConnected = false;
        data.secureInt.accessibility_enabled = "1";
    });
    assert.equal(result.decision.ok, true, texts(result.decision));
});

test("fail: the bridge refuses power save, overlay, battery, WeChat, and background popup", function () {
    assertRefusal(decideWith(function (data) {
        data.powerSave = true;
    }).decision, "power_save", "省电模式");

    assertRefusal(decideWith(function (data) {
        data.overlays = false;
    }).decision, "overlay", "悬浮窗");

    assertRefusal(decideWith(function (data) {
        data.battery["org.autojs.autojs6"] = false;
    }).decision, "battery", "无限制");

    const missingWechat = decideWith(function (data) {
        data.installed["com.tencent.mm"] = false;
    }).decision;
    assertRefusal(missingWechat, "wechat_installed", "没有安装微信");
    assert.equal(ids(missingWechat).indexOf("wechat_battery"), -1);

    assertRefusal(decideWith(function (data) {
        data.ops["10021 org.autojs.autojs6"] = 1;
    }).decision, "background_popup", "后台弹出界面");

    assertRefusal(decideWith(function (data) {
        data.sdk = 33;
        data.permissions["android.permission.POST_NOTIFICATIONS"] = -1;
    }).decision, "post_notifications", "通知");

    assertRefusal(decideWith(function (data) {
        data.permissions["android.permission.WAKE_LOCK"] = -1;
    }).decision, "wake_lock", "点不亮屏幕");

    assertRefusal(decideWith(function (data) {
        data.ops["android:post_notification com.tencent.mm"] = 1;
    }).decision, "wechat_notifications", "微信的通知");
});

test("pass: Java-style boolean strings from the device are understood", function () {
    const result = decideWith(function (data) {
        data.overlays = "true";
        data.powerSave = "false";
        data.battery["org.autojs.autojs6"] = "true";
        data.battery["com.tencent.mm"] = "true";
        data.serviceConnected = "true";
    });
    assert.equal(result.decision.ok, true, texts(result.decision));
});

test("fail: without Android APIs the preflight refuses instead of enabling", function () {
    const decision = Preflight.resolvePreflight(Preflight.createAndroidBridge());
    assert.equal(decision.ok, false);
    assert.match(decision.summary, /还不能自动接听/);
    assert.doesNotMatch(texts(decision), BANNED);
});

test("component list matches the package and not a longer name", function () {
    const includes = Preflight.componentListIncludesPackage;
    assert.equal(includes(null, "org.autojs.autojs6"), false);
    assert.equal(includes("", "org.autojs.autojs6"), false);
    assert.equal(includes("org.autojs.autojs6/com.example.Service", "org.autojs.autojs6"), true);
    assert.equal(includes("com.other/foo:org.autojs.autojs6/bar", "org.autojs.autojs6"), true);
    assert.equal(includes("org.autojs.autojs6x/bar", "org.autojs.autojs6"), false);
    assert.equal(includes(" org.autojs.autojs6/bar ", "org.autojs.autojs6"), true);
    assert.equal(includes("org.autojs.autojs6", "org.autojs.autojs6"), true);
});

test("app-op and notification states map only the real allow and deny values", function () {
    assert.equal(Preflight.appOpsModeToState(0), "allowed");
    assert.equal(Preflight.appOpsModeToState(1), "denied");
    assert.equal(Preflight.appOpsModeToState(2), "unknown");
    assert.equal(Preflight.appOpsModeToState(3), "unknown");
    assert.equal(Preflight.appOpsModeToState("0"), "allowed");
    assert.equal(Preflight.appOpsModeToState("1"), "denied");
    assert.equal(Preflight.appOpsModeToState(null), "unknown");
    assert.equal(Preflight.appOpsModeToState(undefined), "unknown");
    assert.equal(Preflight.appOpsModeToState("nope"), "unknown");

    assert.equal(Preflight.postNotificationsState(32, -1), "not_required");
    assert.equal(Preflight.postNotificationsState(33, 0), "granted");
    assert.equal(Preflight.postNotificationsState(33, -1), "denied");
    assert.equal(Preflight.postNotificationsState("33", "0"), "granted");
    assert.equal(Preflight.postNotificationsState(undefined, 0), "denied");

    assert.equal(Preflight.coerceBoolean(true), true);
    assert.equal(Preflight.coerceBoolean(false), false);
    assert.equal(Preflight.coerceBoolean("true"), true);
    assert.equal(Preflight.coerceBoolean("false"), false);
    assert.equal(Preflight.coerceBoolean(null), "unknown");
    assert.equal(Preflight.coerceBoolean(1), "unknown");
});

test("the refusal dialog explains the problem in plain language", function () {
    const one = Preflight.evaluatePreflight(passingEnv({ notificationListenerEnabled: false }));
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
    Preflight.showPreflightRefusal(one, ui);
    assert.equal(ui.alerts.length, 1);
    assert.equal(ui.alerts[0][0], "还不能自动接听");
    assert.match(ui.alerts[0][1], /通知使用权/);
    assert.equal(ui.logs[0], one.summary);
    assert.deepEqual(ui.opened, [{ action: "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS" }]);
    assert.equal(ui.toasts.length, 0);

    const many = Preflight.evaluatePreflight(passingEnv({
        notificationListenerEnabled: false,
        powerSaveMode: true,
    }));
    const uiMany = {
        alerts: [],
        opened: [],
        log: function () {},
        alert: function (title, message) { this.alerts.push(message); },
        toast: function () {},
        openSettings: function (target) { this.opened.push(target); },
    };
    Preflight.showPreflightRefusal(many, uiMany);
    assert.equal(uiMany.opened.length, 0);
    assert.match(uiMany.alerts[0], /通知使用权/);
    assert.match(uiMany.alerts[0], /省电模式/);
});

test("a broken dialog still leaves a short explanation and does not throw", function () {
    const decision = Preflight.evaluatePreflight(passingEnv({ notificationListenerEnabled: false }));
    const ui = {
        toasts: [],
        opened: [],
        log: function () {},
        alert: function () { throw new Error("no dialog"); },
        toast: function (message) { this.toasts.push(message); },
        openSettings: function (target) { this.opened.push(target); },
    };
    assert.doesNotThrow(function () {
        Preflight.showPreflightRefusal(decision, ui);
    });
    assert.equal(ui.toasts.length, 1);
    assert.match(ui.toasts[0], /还不能自动接听/);
    assert.equal(ui.opened.length, 1);

    const exploding = {
        log: function () { throw new Error("log"); },
        alert: function () { throw new Error("alert"); },
        toast: function () { throw new Error("toast"); },
        openSettings: function () { throw new Error("settings"); },
    };
    assert.doesNotThrow(function () {
        Preflight.showPreflightRefusal(decision, exploding);
    });
});

test("settings are opened only for a single known page", function () {
    assert.equal(Preflight.settingsTargetFor(null), null);
    assert.equal(Preflight.settingsTargetFor([]), null);
    assert.equal(Preflight.settingsTargetFor([{ id: "overlay", text: "x" }]), null);
});
