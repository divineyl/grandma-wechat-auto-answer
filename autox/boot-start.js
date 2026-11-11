/**
 * 开机/AutoJs6 启动后拉起全屏接听脚本。
 * 若主脚本已在运行，不会再开一份。
 * 读不到运行状态时也不再开一份，避免两份脚本一起点。
 */
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

function resolveMain() {
    var candidates = [];
    try {
        candidates.push(files.join(files.cwd(), "auto-answer-fullscreen.js"));
    } catch (e) {
        logFail("读取当前目录失败", e);
    }
    try {
        candidates.push(files.join("/sdcard/脚本", "auto-answer-fullscreen.js"));
    } catch (e2) {
        candidates.push("/sdcard/脚本/auto-answer-fullscreen.js");
        logFail("拼接脚本路径失败", e2);
    }
    var i;
    for (i = 0; i < candidates.length; i++) {
        try {
            if (candidates[i] && files.exists(candidates[i])) {
                return candidates[i];
            }
        } catch (e3) {
            logFail("检查脚本是否存在失败", e3);
        }
    }
    return "";
}

function findRunning() {
    var running;
    try {
        running = engines.all();
    } catch (e) {
        logFail("无法读取正在运行的脚本", e);
        return "unknown";
    }
    if (!running || typeof running.length !== "number") {
        log("引擎列表不可用，为避免开两份而停止");
        return "unknown";
    }
    var i;
    var unreadable = 0;
    for (i = 0; i < running.length; i++) {
        try {
            var src = running[i].getSource();
            if (src && ("" + src).indexOf("auto-answer-fullscreen") >= 0) {
                return "running";
            }
        } catch (e2) {
            unreadable++;
            logFail("读取引擎来源失败", e2);
        }
    }
    if (unreadable > 0) {
        log("有引擎来源读失败，为避免开两份而停止");
        return "unknown";
    }
    return "not-running";
}

function stopBecause(message) {
    try {
        toast(message);
    } catch (e) {
        logFail("提示失败", e);
    }
    exit();
}

var mainPath = resolveMain();
if (!mainPath) {
    log("找不到 auto-answer-fullscreen.js");
    stopBecause("找不到 auto-answer-fullscreen.js");
}

var state = findRunning();
if (state === "running") {
    stopBecause("接听脚本已在运行");
}
if (state !== "not-running") {
    stopBecause("无法确认接听脚本状态，未再启动");
}

var started = false;
var attempt;
for (attempt = 1; attempt <= 2; attempt++) {
    try {
        engines.execScriptFile(mainPath);
        started = true;
        break;
    } catch (e) {
        logFail("启动主脚本失败，第" + attempt + "次", e);
        state = findRunning();
        if (state === "running") {
            started = true;
            break;
        }
        if (state !== "not-running") {
            stopBecause("无法确认接听脚本状态，未再启动");
        }
        if (attempt < 2) {
            try {
                sleep(500);
            } catch (eSleep) {
                logFail("等待重试时失败", eSleep);
            }
        }
    }
}
if (!started) {
    stopBecause("启动接听脚本失败");
}
log("已启动全屏接听脚本");
