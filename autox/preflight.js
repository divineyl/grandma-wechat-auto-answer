/**
 * 自动接听开启前的设置检查。
 * 只判断能不能开始，不点屏幕，也不把聊天通知当成来电。
 * AutoJs6 里由主脚本 eval 加载；Node 测试直接 require。
 */
var Preflight = (function () {
    var WECHAT_PACKAGE = "com.tencent.mm";
    var POST_NOTIFICATIONS_SDK = 33;

    function coerceBoolean(value) {
        if (value === true || value === false) {
            return value;
        }
        var text = "";
        try {
            text = String(value);
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
            if (compPkg === pkg) {
                return true;
            }
        }
        return false;
    }

    function appOpsModeToState(mode) {
        if (mode === null || mode === undefined) {
            return "unknown";
        }
        var n = parseInt(mode, 10);
        if (isNaN(n)) {
            return "unknown";
        }
        if (n === 0) {
            return "allowed";
        }
        if (n === 1) {
            return "denied";
        }
        return "unknown";
    }

    function postNotificationsState(sdkInt, permissionResult) {
        var sdk = parseInt(sdkInt, 10);
        if (isNaN(sdk)) {
            return "denied";
        }
        if (sdk < POST_NOTIFICATIONS_SDK) {
            return "not_required";
        }
        if (parseInt(permissionResult, 10) === 0) {
            return "granted";
        }
        return "denied";
    }

    function failure(id, text, settingsAction) {
        var item = { id: id, text: text };
        if (settingsAction) {
            item.settingsAction = settingsAction;
        }
        return item;
    }

    function accessibilityFailure(env) {
        if (env.accessibilityServiceConnected === true || env.accessibilitySettingEnabled === true) {
            return null;
        }
        if (env.accessibilitySettingEnabled === false) {
            return failure(
                "accessibility",
                "「无障碍」没打开。请打开系统设置，搜索「无障碍」，把 AutoJs6 或「微信接听」的开关打开。不打开的话，平板不会自己去点接听。",
                "android.settings.ACCESSIBILITY_SETTINGS"
            );
        }
        return failure(
            "accessibility",
            "没能确认「无障碍」是不是开着。请打开系统设置，搜索「无障碍」，把 AutoJs6 或「微信接听」的开关打开，然后再运行。不打开的话，平板不会自己去点接听。",
            "android.settings.ACCESSIBILITY_SETTINGS"
        );
    }

    function notificationFailure(env) {
        if (env.notificationListenerEnabled === true) {
            return null;
        }
        if (env.notificationListenerEnabled === false) {
            return failure(
                "notification_listener",
                "「通知使用权」没给这个接听应用。请打开系统设置，搜索「通知使用权」（有的手机叫「通知监听」），把 AutoJs6 或「微信接听」打开。不打开的话，平板听不到微信来电。",
                "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"
            );
        }
        return failure(
            "notification_listener",
            "没能确认「通知使用权」有没有打开。请打开系统设置，搜索「通知使用权」（有的手机叫「通知监听」），把 AutoJs6 或「微信接听」打开，然后再运行。不打开的话，平板听不到微信来电。",
            "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"
        );
    }

    function ownSwitchFailure(value, offId, offText, unknownText, settingsAction) {
        if (value === true) {
            return null;
        }
        if (value === false) {
            return failure(offId, offText, settingsAction);
        }
        return failure(offId, unknownText, settingsAction);
    }

    function evaluatePreflight(env) {
        env = env || {};
        var failures = [];

        function push(item) {
            if (item) {
                failures.push(item);
            }
        }

        if (env.wechatInstalled !== true) {
            push(failure(
                "wechat_installed",
                "平板上没有安装微信，所以没法接电话。请先装好微信并登录。"
            ));
        }

        push(accessibilityFailure(env));
        push(notificationFailure(env));

        if (env.postNotifications !== "granted" && env.postNotifications !== "not_required") {
            push(failure(
                "post_notifications",
                "这个接听应用还不能弹出通知。请打开系统设置，找到 AutoJs6 或「微信接听」，把通知允许打开。不然你很难知道它有没有在运行。"
            ));
        }

        if (env.wakeLock !== "granted") {
            if (env.wakeLock === "denied") {
                push(failure(
                    "wake_lock",
                    "这个应用点不亮屏幕。请让家人按说明重新安装官方的 AutoJs6，不要装来路不明的安装包。"
                ));
            } else {
                push(failure(
                    "wake_lock",
                    "没能确认这个应用能不能点亮屏幕。请让家人确认装的是说明里的官方 AutoJs6，然后再运行。"
                ));
            }
        }

        push(ownSwitchFailure(
            env.canDrawOverlays,
            "overlay",
            "还没允许「显示悬浮窗」。请打开系统设置，搜索「悬浮窗」，允许 AutoJs6 或「微信接听」。不允许的话，来电画面可能出不来。",
            "没能确认「显示悬浮窗」是不是允许的。请打开系统设置，搜索「悬浮窗」，允许 AutoJs6 或「微信接听」，然后再运行。不允许的话，来电画面可能出不来。"
        ));

        // 后台弹出界面只有部分手机（例如小米）会报告。读不到就不拦，避免在普通安卓上误停。
        if (env.backgroundPopup === "denied") {
            push(failure(
                "background_popup",
                "「后台弹出界面」没设成始终允许。请打开系统设置，搜索「后台弹出界面」，把 AutoJs6 或「微信接听」设为始终允许。不然微信来电页面可能弹不出来。"
            ));
        }

        push(ownSwitchFailure(
            env.ignoringBatteryOptimizations,
            "battery",
            "省电策略不是「无限制」。请打开 AutoJs6 或「微信接听」的应用信息，把省电策略改成无限制。不然过一会儿平板会把接听关掉。",
            "没能确认省电策略是不是「无限制」。请打开 AutoJs6 或「微信接听」的应用信息看一眼，改成无限制后再运行。不然过一会儿平板会把接听关掉。",
            "android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS"
        ));

        if (env.powerSaveMode === true) {
            push(failure(
                "power_save",
                "系统「省电模式」开着。请先关掉省电模式和超级省电。开着的时候，平板会把微信和接听一起停掉。",
                "android.settings.BATTERY_SAVER_SETTINGS"
            ));
        } else if (env.powerSaveMode !== false) {
            push(failure(
                "power_save",
                "没能确认省电模式是不是关着。请打开系统设置里的电池，把省电模式和超级省电都关掉，然后再运行。",
                "android.settings.BATTERY_SAVER_SETTINGS"
            ));
        }

        if (env.wechatInstalled === true) {
            if (env.wechatNotifications === "denied") {
                push(failure(
                    "wechat_notifications",
                    "微信的通知是关着的。请打开微信的通知。不打开的话，平板收不到来电提醒，也就不会接。"
                ));
            }
            if (env.wechatCanDrawOverlays === "denied") {
                push(failure(
                    "wechat_overlay",
                    "微信的「显示悬浮窗」没允许。请在系统设置里允许微信显示悬浮窗，否则来电画面可能不出现。"
                ));
            }
            if (env.wechatBackgroundPopup === "denied") {
                push(failure(
                    "wechat_background",
                    "微信的「后台弹出界面」不是始终允许。请在系统设置里把微信的后台弹出界面改成始终允许，来电画面才能出来。"
                ));
            }
            push(ownSwitchFailure(
                env.wechatIgnoringBatteryOptimizations,
                "wechat_battery",
                "微信的省电策略不是「无限制」。请打开微信的应用信息，把省电策略改成无限制。不然微信过一会儿会被关掉，来电就接不到。",
                "没能确认微信的省电策略是不是「无限制」。请打开微信的应用信息看一眼，改成无限制后再运行。"
            ));
        }

        var summary = "";
        if (failures.length) {
            var lines = ["还不能自动接听，所以这次没有开启。请先做完下面的事，再重新运行："];
            var i;
            for (i = 0; i < failures.length; i++) {
                lines.push("");
                lines.push((i + 1) + ". " + failures[i].text);
            }
            summary = lines.join("\n");
        }

        return {
            ok: failures.length === 0,
            failures: failures,
            summary: summary,
        };
    }

    function readPreflightEnv(bridge) {
        function ask(name, fallback) {
            try {
                if (!bridge || typeof bridge[name] !== "function") {
                    return fallback;
                }
                var value = bridge[name]();
                if (value === undefined || value === null) {
                    return fallback;
                }
                return value;
            } catch (e) {
                return fallback;
            }
        }

        return {
            wechatInstalled: ask("wechatInstalled", false),
            accessibilitySettingEnabled: ask("accessibilitySettingEnabled", "unknown"),
            accessibilityServiceConnected: ask("accessibilityServiceConnected", "unknown"),
            notificationListenerEnabled: ask("notificationListenerEnabled", "unknown"),
            postNotifications: ask("postNotifications", "denied"),
            wakeLock: ask("wakeLock", "unknown"),
            canDrawOverlays: ask("canDrawOverlays", "unknown"),
            backgroundPopup: ask("backgroundPopup", "unknown"),
            ignoringBatteryOptimizations: ask("ignoringBatteryOptimizations", "unknown"),
            powerSaveMode: ask("powerSaveMode", "unknown"),
            wechatNotifications: ask("wechatNotifications", "unknown"),
            wechatCanDrawOverlays: ask("wechatCanDrawOverlays", "unknown"),
            wechatBackgroundPopup: ask("wechatBackgroundPopup", "unknown"),
            wechatIgnoringBatteryOptimizations: ask("wechatIgnoringBatteryOptimizations", "unknown"),
        };
    }

    function resolvePreflight(bridge) {
        return evaluatePreflight(readPreflightEnv(bridge));
    }

    function settingsTargetFor(failures) {
        if (!failures || failures.length !== 1) {
            return null;
        }
        var action = failures[0].settingsAction;
        if (!action) {
            return null;
        }
        return { action: action };
    }

    function showPreflightRefusal(decision, ui) {
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
        var summary = decision && decision.summary
            ? decision.summary
            : "还不能自动接听。请让家人打开无障碍和通知使用权后再运行。";
        try {
            view.log(summary);
        } catch (e) {}
        try {
            view.alert("还不能自动接听", summary);
        } catch (e2) {
            try {
                view.toast("还不能自动接听。请让家人打开无障碍和通知使用权后再运行。");
            } catch (e3) {}
        }
        var target = settingsTargetFor(decision && decision.failures);
        if (target) {
            try {
                view.openSettings(target);
            } catch (e4) {}
        }
    }

    function createAndroidBridge(host) {
        if (!host) {
            host = liveAndroidHost();
        }
        return {
            wechatInstalled: function () {
                try {
                    host.getPackageInfo(WECHAT_PACKAGE);
                    return true;
                } catch (e) {
                    return false;
                }
            },
            accessibilitySettingEnabled: function () {
                var listed = componentListIncludesPackage(
                    host.getSecureString("enabled_accessibility_services"),
                    host.myPackageName()
                );
                var master = parseInt(host.getSecureInt("accessibility_enabled", 0), 10);
                return listed === true && master === 1;
            },
            accessibilityServiceConnected: function () {
                return coerceBoolean(host.accessibilityServiceConnected());
            },
            notificationListenerEnabled: function () {
                return componentListIncludesPackage(
                    host.getSecureString("enabled_notification_listeners"),
                    host.myPackageName()
                );
            },
            postNotifications: function () {
                return postNotificationsState(
                    host.sdkInt(),
                    host.checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                );
            },
            wakeLock: function () {
                if (parseInt(host.checkSelfPermission("android.permission.WAKE_LOCK"), 10) === 0) {
                    return "granted";
                }
                return "denied";
            },
            canDrawOverlays: function () {
                return coerceBoolean(host.canDrawOverlays());
            },
            backgroundPopup: function () {
                return appOpsModeToState(host.checkOp(10021, host.myPackageName()));
            },
            ignoringBatteryOptimizations: function () {
                return coerceBoolean(host.ignoringBatteryOptimizations(host.myPackageName()));
            },
            powerSaveMode: function () {
                return coerceBoolean(host.powerSaveMode());
            },
            wechatNotifications: function () {
                return appOpsModeToState(host.checkOp("android:post_notification", WECHAT_PACKAGE));
            },
            wechatCanDrawOverlays: function () {
                return appOpsModeToState(host.checkOp("android:system_alert_window", WECHAT_PACKAGE));
            },
            wechatBackgroundPopup: function () {
                return appOpsModeToState(host.checkOp(10021, WECHAT_PACKAGE));
            },
            wechatIgnoringBatteryOptimizations: function () {
                return coerceBoolean(host.ignoringBatteryOptimizations(WECHAT_PACKAGE));
            },
        };
    }

    function liveAndroidHost() {
        return {
            getPackageInfo: function (pkg) {
                return context.getPackageManager().getPackageInfo(pkg, 0);
            },
            getSecureInt: function (name, def) {
                return android.provider.Settings.Secure.getInt(context.getContentResolver(), name, def);
            },
            getSecureString: function (name) {
                return android.provider.Settings.Secure.getString(context.getContentResolver(), name);
            },
            myPackageName: function () {
                return context.getPackageName();
            },
            accessibilityServiceConnected: function () {
                try {
                    return auto.service != null;
                } catch (e) {
                    return false;
                }
            },
            sdkInt: function () {
                return android.os.Build.VERSION.SDK_INT;
            },
            checkSelfPermission: function (name) {
                return context.checkSelfPermission(name);
            },
            canDrawOverlays: function () {
                return android.provider.Settings.canDrawOverlays(context);
            },
            checkOp: function (op, pkg) {
                var info = context.getPackageManager().getApplicationInfo(pkg, 0);
                var appOps = context.getSystemService(android.content.Context.APP_OPS_SERVICE);
                var uid = info.uid;
                if (typeof op === "number") {
                    var method = appOps.getClass().getMethod(
                        "checkOpNoThrow",
                        java.lang.Integer.TYPE,
                        java.lang.Integer.TYPE,
                        java.lang.String.class
                    );
                    var raw = method.invoke(
                        appOps,
                        java.lang.Integer.valueOf(op),
                        java.lang.Integer.valueOf(uid),
                        pkg
                    );
                    return raw.intValue();
                }
                return appOps.checkOpNoThrow(String(op), uid, pkg);
            },
            ignoringBatteryOptimizations: function (pkg) {
                var power = context.getSystemService(android.content.Context.POWER_SERVICE);
                return power.isIgnoringBatteryOptimizations(pkg);
            },
            powerSaveMode: function () {
                var power = context.getSystemService(android.content.Context.POWER_SERVICE);
                return power.isPowerSaveMode();
            },
        };
    }

    return {
        coerceBoolean: coerceBoolean,
        componentListIncludesPackage: componentListIncludesPackage,
        appOpsModeToState: appOpsModeToState,
        postNotificationsState: postNotificationsState,
        evaluatePreflight: evaluatePreflight,
        readPreflightEnv: readPreflightEnv,
        resolvePreflight: resolvePreflight,
        settingsTargetFor: settingsTargetFor,
        showPreflightRefusal: showPreflightRefusal,
        createAndroidBridge: createAndroidBridge,
    };
})();

if (typeof process !== "undefined" && process.versions && process.versions.node) {
    module.exports = Preflight;
}
