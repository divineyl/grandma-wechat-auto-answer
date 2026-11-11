/**
 * 脚本已经跑起来之后，确认无障碍和通知使用权还在。
 * 缺了，或确认不了，就停。这里不点屏幕，也不猜按钮位置。
 * AutoJs6 里由主脚本 eval 加载；Node 测试直接 require。
 */
var AccessWatch = (function () {
    var ACCESSIBILITY_SETTINGS = "android.settings.ACCESSIBILITY_SETTINGS";
    var NOTIFICATION_SETTINGS = "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS";
    var FALLBACK_MESSAGE = "自动接听已经停了。没能确认无障碍或通知使用权是不是还开着。请让家人重新打开这两项，再运行这个脚本。在那之前，平板不会再点屏幕，也不会去猜按钮在哪里。";

    function unknownSnapshot() {
        return {
            accessibilityServiceConnected: "unknown",
            accessibilitySettingEnabled: "unknown",
            notificationListenerEnabled: "unknown",
        };
    }

    function componentListIncludesPackage(flat, pkg) {
        if (!flat || !pkg) {
            return false;
        }
        var parts = String(flat).split(":");
        var i;
        for (i = 0; i < parts.length; i++) {
            var comp = parts[i].replace(/^\s+|\s+$/g, "");
            if (!comp) {
                continue;
            }
            var slash = comp.indexOf("/");
            var compPkg = slash >= 0 ? comp.substring(0, slash) : comp;
            if ("" + compPkg === "" + pkg) {
                return true;
            }
        }
        return false;
    }

    function normalizeConnected(value) {
        if (value === true || value === false) {
            return value;
        }
        if (value == null) {
            return false;
        }
        var text = "";
        try {
            text = "" + value;
        } catch (e) {
            return "unknown";
        }
        if (text === "true") {
            return true;
        }
        if (text === "false") {
            return false;
        }
        return "unknown";
    }

    function readAccessibilitySetting(host) {
        var master = parseInt(host.getSecureInt("accessibility_enabled", -1), 10);
        if (isNaN(master) || master < 0) {
            return "unknown";
        }
        if (master === 0) {
            return false;
        }
        if (master !== 1) {
            return "unknown";
        }
        var flat = host.getSecureString("enabled_accessibility_services");
        if (flat == null) {
            flat = "";
        }
        return componentListIncludesPackage(flat, host.myPackageName()) === true;
    }

    function readNotificationListener(host) {
        var flat = host.getSecureString("enabled_notification_listeners");
        if (flat == null) {
            return false;
        }
        return componentListIncludesPackage(flat, host.myPackageName()) === true;
    }

    function readField(host, reader) {
        try {
            if (!host || typeof reader !== "function") {
                return "unknown";
            }
            return reader(host);
        } catch (e) {
            return "unknown";
        }
    }

    function readSnapshot(host) {
        if (!host) {
            return unknownSnapshot();
        }
        return {
            accessibilityServiceConnected: readField(host, function (item) {
                return normalizeConnected(item.accessibilityServiceConnected());
            }),
            accessibilitySettingEnabled: readField(host, readAccessibilitySetting),
            notificationListenerEnabled: readField(host, readNotificationListener),
        };
    }

    function signalState(connected, settingOn) {
        if (connected === false || settingOn === false) {
            return "off";
        }
        if (connected === true && settingOn === true) {
            return "ok";
        }
        return "uncertain";
    }

    function notificationState(enabled) {
        if (enabled === true) {
            return "ok";
        }
        if (enabled === false) {
            return "off";
        }
        return "uncertain";
    }

    function problem(id, kind) {
        return { id: id, kind: kind };
    }

    function collectProblems(a11y, note) {
        var problems = [];
        if (a11y === "off") {
            problems.push(problem("accessibility", "off"));
        } else if (a11y === "uncertain") {
            problems.push(problem("accessibility", "uncertain"));
        }
        if (note === "off") {
            problems.push(problem("notification_listener", "off"));
        } else if (note === "uncertain") {
            problems.push(problem("notification_listener", "uncertain"));
        }
        return problems;
    }

    function describeLoss(a11y, note) {
        if (a11y === "off" && note === "off") {
            return "无障碍被关掉了，通知使用权也被关掉了";
        }
        if (a11y === "uncertain" && note === "uncertain") {
            return "没能确认无障碍和通知使用权是不是还开着";
        }
        var parts = [];
        if (a11y === "off") {
            parts.push("无障碍被关掉了");
        } else if (a11y === "uncertain") {
            parts.push("没能确认无障碍是不是还开着");
        }
        if (note === "off") {
            parts.push("通知使用权被关掉了");
        } else if (note === "uncertain") {
            parts.push("没能确认通知使用权是不是还开着");
        }
        return parts.join("，");
    }

    function adviceFor(a11y, note) {
        if (a11y !== "ok" && note !== "ok") {
            return "请让家人打开系统设置，把 AutoJs6 或「微信接听」的无障碍和通知使用权打开并确认，然后再运行这个脚本。";
        }
        if (a11y !== "ok") {
            return "请让家人打开系统设置，搜索「无障碍」，把 AutoJs6 或「微信接听」打开并确认，然后再运行这个脚本。";
        }
        return "请让家人打开系统设置，搜索「通知使用权」（有的手机叫「通知监听」），把 AutoJs6 或「微信接听」打开并确认，然后再运行这个脚本。";
    }

    function settingsActionFor(a11y, note) {
        if (a11y !== "ok" && note === "ok") {
            return ACCESSIBILITY_SETTINGS;
        }
        if (a11y === "ok" && note !== "ok") {
            return NOTIFICATION_SETTINGS;
        }
        return null;
    }

    function messageFor(a11y, note) {
        return "自动接听已经停了。" + describeLoss(a11y, note) + "。" + adviceFor(a11y, note) + "在那之前，平板不会再点屏幕，也不会去猜按钮在哪里。";
    }

    function evaluateAccess(snapshot) {
        if (!snapshot || typeof snapshot !== "object") {
            snapshot = unknownSnapshot();
        }
        var a11y = signalState(snapshot.accessibilityServiceConnected, snapshot.accessibilitySettingEnabled);
        var note = notificationState(snapshot.notificationListenerEnabled);
        if (a11y === "ok" && note === "ok") {
            return {
                ok: true,
                problems: [],
                message: "",
                settingsAction: null,
            };
        }
        return {
            ok: false,
            problems: collectProblems(a11y, note),
            message: messageFor(a11y, note),
            settingsAction: settingsActionFor(a11y, note),
        };
    }

    function resolveAccess(host) {
        return evaluateAccess(readSnapshot(host));
    }

    function createGuard(handlers) {
        var stopped = false;
        return {
            isStopped: function () {
                return stopped;
            },
            permit: function (snapshot) {
                if (stopped) {
                    return false;
                }
                var decision = evaluateAccess(snapshot);
                if (decision.ok === true) {
                    return true;
                }
                stopped = true;
                try {
                    if (handlers && typeof handlers.onStop === "function") {
                        handlers.onStop(decision);
                    }
                } catch (e) {}
                return false;
            },
        };
    }

    function gate(guard, snapshot, action) {
        if (!guard || typeof guard.permit !== "function") {
            return false;
        }
        if (guard.permit(snapshot) !== true) {
            return false;
        }
        if (typeof action !== "function") {
            return true;
        }
        return action();
    }

    function knownSettingsAction(action) {
        if (action === ACCESSIBILITY_SETTINGS || action === NOTIFICATION_SETTINGS) {
            return action;
        }
        return null;
    }

    function showLostAccess(decision, ui) {
        var view = ui;
        if (!view) {
            view = {
                log: function (message) {
                    try {
                        log(message);
                    } catch (e) {}
                },
                alert: function (title, message) {
                    alert(title, message);
                },
                toast: function (message) {
                    toast(message);
                },
                openSettings: function (target) {
                    app.startActivity({ action: target.action });
                },
            };
        }
        var message = decision && decision.message ? decision.message : FALLBACK_MESSAGE;
        try {
            view.log(message);
        } catch (e) {}
        var alertFailed = false;
        try {
            view.alert("自动接听已经停了", message);
        } catch (e2) {
            alertFailed = true;
        }
        if (alertFailed) {
            try {
                view.toast(message);
            } catch (e3) {}
        }
        var action = knownSettingsAction(decision && decision.settingsAction);
        if (action) {
            try {
                view.openSettings({ action: action });
            } catch (e4) {}
        }
    }

    function createAndroidHost() {
        return {
            getSecureInt: function (name, def) {
                return android.provider.Settings.Secure.getInt(context.getContentResolver(), name, def);
            },
            getSecureString: function (name) {
                return android.provider.Settings.Secure.getString(context.getContentResolver(), name);
            },
            myPackageName: function () {
                var name = context.getPackageName();
                if (!name) {
                    throw new Error("missing package");
                }
                return "" + name;
            },
            accessibilityServiceConnected: function () {
                return auto.service != null;
            },
        };
    }

    return {
        FALLBACK_MESSAGE: FALLBACK_MESSAGE,
        ACCESSIBILITY_SETTINGS: ACCESSIBILITY_SETTINGS,
        NOTIFICATION_SETTINGS: NOTIFICATION_SETTINGS,
        unknownSnapshot: unknownSnapshot,
        componentListIncludesPackage: componentListIncludesPackage,
        readSnapshot: readSnapshot,
        evaluateAccess: evaluateAccess,
        resolveAccess: resolveAccess,
        createGuard: createGuard,
        gate: gate,
        showLostAccess: showLostAccess,
        createAndroidHost: createAndroidHost,
    };
})();

if (typeof process !== "undefined" && process.versions && process.versions.node) {
    module.exports = AccessWatch;
}
