const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function createHost() {
  const trace = {
    logs: [],
    toasts: [],
    clicks: [],
    launches: [],
    activities: [],
    wakes: 0,
    execs: [],
    observeCalls: 0,
    intervals: [],
    sleeps: 0,
  };
  let now = 1000000;
  const ctx = {
    console,
    Math,
    trace,
    _setNow(value) {
      now = value;
    },
    _advance(ms) {
      now += ms;
    },
    Date: {
      now() {
        return now;
      },
    },
    setInterval(fn, ms) {
      trace.intervals.push({ fn, ms });
      return trace.intervals.length;
    },
    sleep() {
      trace.sleeps += 1;
    },
    toast(msg) {
      trace.toasts.push(String(msg));
    },
    log(msg) {
      trace.logs.push(String(msg));
    },
    click(x, y) {
      trace.clicks.push([x, y]);
      return typeof x === "number";
    },
    exit(code) {
      const err = new Error("EXIT");
      err.code = code;
      throw err;
    },
    device: {
      width: 1000,
      height: 2000,
      isScreenOn() {
        return true;
      },
      wakeUp() {
        trace.wakes += 1;
      },
    },
    auto: {
      service: true,
      waitFor() {},
    },
    app: {
      launchApp(name) {
        trace.launches.push("app:" + name);
      },
      launchPackage(pkg) {
        trace.launches.push("pkg:" + pkg);
      },
      startActivity(opts) {
        trace.activities.push(opts);
      },
    },
    events: {
      observeNotification() {
        trace.observeCalls += 1;
        if (ctx._observeError) {
          throw ctx._observeError;
        }
      },
      onNotification(fn) {
        ctx._onNotification = fn;
      },
      on(name, fn) {
        ctx._on[name] = fn;
      },
    },
    _observeError: null,
    _on: {},
    desc() {
      return { findOnce() { return null; } };
    },
    text() {
      return { findOnce() { return null; } };
    },
    textContains() {
      return { findOnce() { return null; } };
    },
    packageName() {
      return {
        desc() {
          return { findOnce() { return null; } };
        },
        text() {
          return { findOnce() { return null; } };
        },
      };
    },
    files: {
      cwd() {
        return "/sdcard/脚本";
      },
      join(dir, name) {
        return String(dir).replace(/\/$/, "") + "/" + name;
      },
      exists() {
        return true;
      },
    },
    engines: {
      all() {
        return [];
      },
      execScriptFile(file) {
        trace.execs.push(file);
      },
    },
    android: {
      content: {
        Intent: {
          FLAG_ACTIVITY_NEW_TASK: 1,
          FLAG_ACTIVITY_REORDER_TO_FRONT: 2,
          FLAG_ACTIVITY_SINGLE_TOP: 4,
        },
      },
    },
    context: {
      getPackageManager() {
        return {
          getLaunchIntentForPackage() {
            return null;
          },
        };
      },
    },
  };
  return { ctx, trace };
}

function run(rel, setup) {
  const { ctx, trace } = createHost();
  if (setup) {
    setup(ctx, trace);
  }
  vm.createContext(ctx);
  let error = null;
  try {
    vm.runInContext(read(rel), ctx, { filename: rel });
  } catch (err) {
    error = err;
  }
  return { ctx, trace, error };
}

function note(partial) {
  const item = {
    clicked: false,
    getPackageName() {
      return partial.pkg || "com.tencent.mm";
    },
    getTitle() {
      if (partial.titleError) {
        throw partial.titleError;
      }
      return partial.title || "";
    },
    getText() {
      if (partial.textError) {
        throw partial.textError;
      }
      return partial.text || "";
    },
    get tickerText() {
      return partial.ticker || "";
    },
    click() {
      if (partial.clickError) {
        throw partial.clickError;
      }
      item.clicked = true;
    },
  };
  return item;
}

function armUi(ctx, hits) {
  function once(value) {
    return {
      findOnce() {
        return hits[value] || null;
      },
    };
  }
  ctx.desc = once;
  ctx.text = once;
  ctx.textContains = once;
  ctx.packageName = function () {
    return { desc: once, text: once };
  };
}

function joined(lines) {
  return lines.join("\n");
}

test("shipped timing and safety rails stay in place", () => {
  const full = read("autox/auto-answer-fullscreen.js");
  const open = read("autox/open-wechat-on-call.js");
  assert.deepEqual(full.match(/pendingUntil = now \+ \d+/g), [
    "pendingUntil = now + 20000",
    "pendingUntil = now + 20000",
  ]);
  assert.match(full, /\}, 400\);/);
  assert.match(open, /COOLDOWN_MS = 8000/);
  assert.equal(open.includes('click("'), false);
  assert.equal(open.includes("click('"), false);
  const words = /TERMINAL_CALL_WORDS = \[([^\]]+)\]/;
  assert.equal(full.match(words)[1], open.match(words)[1]);
});

test("fullscreen script starts the screen poll even when notification access fails", () => {
  const { ctx, trace, error } = run("autox/auto-answer-fullscreen.js", (ctx) => {
    ctx._observeError = new Error("listener off");
  });
  assert.equal(error, null);
  assert.equal(trace.observeCalls, 3);
  assert.equal(trace.sleeps, 2);
  assert.equal(trace.intervals.length, 1);
  assert.equal(trace.intervals[0].ms, 400);
  assert.equal(typeof ctx._on.notification, "function");
  assert.equal(typeof ctx._onNotification, "function");
  assert.ok(trace.toasts.includes("请打开通知使用权：关掉再打开 AutoJs6 那一项"));
  assert.ok(trace.toasts.includes("全屏自动接听运行中"));
  assert.ok(trace.activities.some((item) => item.action === "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"));
  assert.match(joined(trace.logs), /仍会尝试点屏幕上的接听/);
});

test("notification access succeeds without retry or settings", () => {
  const { trace, error } = run("autox/auto-answer-fullscreen.js");
  assert.equal(error, null);
  assert.equal(trace.observeCalls, 1);
  assert.equal(trace.sleeps, 0);
  assert.equal(trace.activities.length, 0);
  assert.ok(trace.logs.includes("wechat auto-answer started"));
});

test("call text accepts invites and rejects finished calls", () => {
  const { ctx } = run("autox/auto-answer-fullscreen.js");
  assert.equal(ctx.isCallText("邀请你视频通话"), true);
  assert.equal(ctx.isCallText("邀请你语音通话"), true);
  assert.equal(ctx.isCallText("微信 视频通话"), true);
  assert.equal(ctx.isCallText("未接视频通话"), false);
  assert.equal(ctx.isCallText("视频通话已结束"), false);
  assert.equal(ctx.isCallText("语音通话已取消"), false);
  assert.equal(ctx.isCallText("对方已拒绝语音通话"), false);
  assert.equal(ctx.isCallText("通话时长 00:12"), false);
  assert.equal(ctx.isCallText("晚上吃饭"), false);
  assert.equal(ctx.isCallText("video call"), false);
  assert.equal(ctx.isCallText(""), false);
  assert.equal(ctx.isCallText(null), false);
});

test("a broken notification title still uses the body", () => {
  const { ctx, trace } = run("autox/auto-answer-fullscreen.js");
  const text = ctx.noteText({
    getTitle() {
      throw new Error("title");
    },
    getText() {
      return "邀请你视频通话";
    },
  });
  assert.match(text, /邀请你视频通话/);
  assert.match(joined(trace.logs), /读取通知标题失败/);
});

test("incoming call opens WeChat once and does not log the caller", () => {
  const { ctx, trace } = run("autox/auto-answer-fullscreen.js");
  ctx.onMaybeCall(note({ title: "保密联系人邀请你视频通话" }));
  assert.deepEqual(trace.launches, ["app:微信", "pkg:com.tencent.mm"]);
  assert.equal(trace.activities.length, 1);
  assert.equal(trace.activities[0].className, "com.tencent.mm.ui.LauncherUI");
  assert.equal(ctx.pendingUntil, 1020000);
  assert.deepEqual(
    trace.toasts.filter((item) => item.includes("检测到微信来电")),
    ["检测到微信来电，正在接听"]
  );
  assert.equal(joined(trace.logs).includes("保密联系人"), false);
  assert.equal(trace.toasts.join("\n").includes("保密联系人"), false);

  ctx._advance(1000);
  ctx.onMaybeCall(note({ title: "保密联系人邀请你视频通话" }));
  assert.equal(trace.launches.length, 2);
  assert.equal(trace.activities.length, 1);
  assert.equal(ctx.pendingUntil, 1021000);
  assert.equal(trace.toasts.filter((item) => item.includes("检测到微信来电")).length, 1);
});

test("a new call after the window ends can open WeChat again", () => {
  const { ctx, trace } = run("autox/auto-answer-fullscreen.js");
  ctx.onMaybeCall(note({ text: "邀请你语音通话" }));
  ctx._advance(20000);
  ctx.onMaybeCall(note({ text: "邀请你语音通话" }));
  assert.equal(trace.launches.length, 4);
  assert.equal(trace.activities.length, 2);
});

test("missed, ended, and other apps do not arm answering", () => {
  const { ctx, trace } = run("autox/auto-answer-fullscreen.js");
  ctx.onMaybeCall(null);
  ctx.onMaybeCall(note({ title: "未接视频通话" }));
  ctx.onMaybeCall(note({ title: "视频通话已结束" }));
  ctx.onMaybeCall(note({ pkg: "com.android.mms", title: "邀请你视频通话" }));
  ctx.onMaybeCall({
    getPackageName() {
      throw new Error("pkg");
    },
  });
  assert.equal(trace.launches.length, 0);
  assert.equal(trace.activities.length, 0);
  assert.equal(ctx.pendingUntil, 0);
  assert.equal(trace.toasts.some((item) => item.includes("检测到微信来电")), false);
  assert.match(joined(trace.logs), /读取通知包名失败/);
});

test("screen and launch failures are logged and retried only when every launch throws", () => {
  const screen = run("autox/auto-answer-fullscreen.js", (ctx) => {
    ctx.device.isScreenOn = () => false;
  });
  screen.ctx.onMaybeCall(note({ title: "邀请你视频通话" }));
  assert.equal(screen.trace.wakes, 1);

  const brokenScreen = run("autox/auto-answer-fullscreen.js", (ctx) => {
    ctx.device.isScreenOn = () => {
      throw new Error("screen");
    };
  });
  brokenScreen.ctx.onMaybeCall(note({ title: "邀请你视频通话", clickError: new Error("shade") }));
  assert.equal(brokenScreen.trace.launches.length, 2);
  assert.match(joined(brokenScreen.trace.logs), /亮屏失败/);
  assert.match(joined(brokenScreen.trace.logs), /点击来电通知失败/);

  const allFail = run("autox/auto-answer-fullscreen.js", (ctx, trace) => {
    ctx.app.launchApp = () => {
      trace.launches.push("app");
      throw new Error("app");
    };
    ctx.app.launchPackage = () => {
      trace.launches.push("pkg");
      throw new Error("pkg");
    };
    ctx.app.startActivity = () => {
      trace.launches.push("act");
      throw new Error("act");
    };
  });
  allFail.ctx.onMaybeCall(note({ title: "邀请你视频通话" }));
  assert.equal(allFail.trace.launches.length, 6);
  assert.match(joined(allFail.trace.logs), /打开微信两次都失败/);

  const oneWorks = run("autox/auto-answer-fullscreen.js", (ctx, trace) => {
    ctx.app.launchApp = () => {
      trace.launches.push("app");
      throw new Error("app");
    };
  });
  oneWorks.ctx.onMaybeCall(note({ title: "邀请你视频通话" }));
  assert.deepEqual(oneWorks.trace.launches, ["app", "pkg:com.tencent.mm"]);
  assert.equal(oneWorks.trace.activities.length, 1);
  assert.equal(joined(oneWorks.trace.logs).includes("两次都失败"), false);
});

test("accessibility loss is reported on a throttle, not on every poll", () => {
  const { ctx, trace } = run("autox/auto-answer-fullscreen.js");
  ctx.auto.service = false;
  assert.equal(ctx.tryAnswerOnce(), false);
  assert.equal(ctx.tryAnswerOnce(), false);
  assert.equal(trace.toasts.filter((item) => item.includes("无障碍")).length, 1);
  ctx._advance(8001);
  assert.equal(ctx.tryAnswerOnce(), false);
  assert.equal(trace.toasts.filter((item) => item.includes("无障碍")).length, 2);
  assert.match(joined(trace.logs), /无障碍服务不可用/);
});

test("reading accessibility does not throw out of the poll", () => {
  const { ctx, trace } = run("autox/auto-answer-fullscreen.js");
  Object.defineProperty(ctx.auto, "service", {
    configurable: true,
    get() {
      throw new Error("dead");
    },
  });
  assert.equal(ctx.tryAnswerOnce(), false);
  assert.match(joined(trace.logs), /读取无障碍状态失败/);
});

test("blind taps require a hangup or reject control", () => {
  const { ctx, trace } = run("autox/auto-answer-fullscreen.js");
  const node = {
    click() {
      return false;
    },
    bounds() {
      return null;
    },
    text() {
      return "";
    },
  };
  armUi(ctx, { 取消: node });
  ctx.pendingUntil = ctx.Date.now() + 20000;
  assert.equal(ctx.clickAnswerByPosition(), false);
  assert.equal(trace.clicks.length, 0);

  armUi(ctx, { 挂断: node });
  assert.equal(ctx.clickAnswerByPosition(), true);
  assert.equal(ctx.clickAnswerByPosition(), true);
  assert.equal(trace.clicks.length, 6);
  assert.deepEqual(trace.clicks[0], [750, 1640]);
  assert.equal(trace.logs.filter((item) => item.includes("右下角")).length, 1);
});

test("a missed-call banner is not treated as the answer button", () => {
  const { ctx } = run("autox/auto-answer-fullscreen.js");
  const missed = {
    text() {
      return "未接视频通话";
    },
  };
  armUi(ctx, { 视频通话: missed });
  assert.equal(ctx.findBanner(), null);
  const invite = {
    text() {
      return "邀请你视频通话";
    },
  };
  armUi(ctx, { "邀请你视频通话": invite });
  assert.equal(ctx.findBanner(), invite);
});

test("boot starts the main script once", () => {
  const { trace, error } = run("autox/boot-start.js");
  assert.equal(error, null);
  assert.deepEqual(trace.execs, ["/sdcard/脚本/auto-answer-fullscreen.js"]);
  assert.ok(trace.logs.includes("已启动全屏接听脚本"));
});

test("boot does not start a second copy", () => {
  const { trace, error } = run("autox/boot-start.js", (ctx) => {
    ctx.engines.all = () => [{ getSource() { return "/sdcard/脚本/auto-answer-fullscreen.js"; } }];
  });
  assert.equal(error && error.message, "EXIT");
  assert.deepEqual(trace.execs, []);
  assert.ok(trace.toasts.includes("接听脚本已在运行"));
});

test("boot reports a missing script and does not execute anything", () => {
  const { trace, error } = run("autox/boot-start.js", (ctx) => {
    ctx.files.exists = () => false;
  });
  assert.equal(error && error.message, "EXIT");
  assert.deepEqual(trace.execs, []);
  assert.ok(trace.toasts.includes("找不到 auto-answer-fullscreen.js"));
});

test("boot falls back when the current directory cannot be read", () => {
  const { trace, error } = run("autox/boot-start.js", (ctx) => {
    ctx.files.cwd = () => {
      throw new Error("no cwd");
    };
    ctx.files.exists = (file) => file === "/sdcard/脚本/auto-answer-fullscreen.js";
  });
  assert.equal(error, null);
  assert.deepEqual(trace.execs, ["/sdcard/脚本/auto-answer-fullscreen.js"]);
  assert.match(joined(trace.logs), /读取当前目录失败/);
});

test("boot stays stopped when engine state is unknown", () => {
  const thrown = run("autox/boot-start.js", (ctx) => {
    ctx.engines.all = () => {
      throw new Error("dead");
    };
  });
  assert.equal(thrown.error && thrown.error.message, "EXIT");
  assert.deepEqual(thrown.trace.execs, []);
  assert.ok(thrown.trace.toasts.includes("无法确认接听脚本状态，未再启动"));

  const empty = run("autox/boot-start.js", (ctx) => {
    ctx.engines.all = () => null;
  });
  assert.equal(empty.error && empty.error.message, "EXIT");
  assert.deepEqual(empty.trace.execs, []);

  const unreadable = run("autox/boot-start.js", (ctx) => {
    ctx.engines.all = () => [{ getSource() { throw new Error("source"); } }];
  });
  assert.equal(unreadable.error && unreadable.error.message, "EXIT");
  assert.deepEqual(unreadable.trace.execs, []);
  assert.match(joined(unreadable.trace.logs), /为避免开两份而停止/);
});

test("boot retries a failed start once, and stops if the script is already up", () => {
  let calls = 0;
  const retried = run("autox/boot-start.js", (ctx, trace) => {
    ctx.engines.execScriptFile = (file) => {
      calls += 1;
      trace.execs.push(file);
      if (calls === 1) {
        throw new Error("busy");
      }
    };
  });
  assert.equal(retried.error, null);
  assert.equal(calls, 2);
  assert.equal(retried.trace.sleeps, 1);

  let started = false;
  const becameRunning = run("autox/boot-start.js", (ctx, trace) => {
    ctx.engines.all = () => {
      if (!started) {
        return [];
      }
      return [{ getSource() { return "auto-answer-fullscreen.js"; } }];
    };
    ctx.engines.execScriptFile = () => {
      started = true;
      trace.execs.push("once");
      throw new Error("started anyway");
    };
  });
  assert.equal(becameRunning.error, null);
  assert.deepEqual(becameRunning.trace.execs, ["once"]);

  const failed = run("autox/boot-start.js", (ctx) => {
    ctx.engines.execScriptFile = () => {
      throw new Error("nope");
    };
  });
  assert.equal(failed.error && failed.error.message, "EXIT");
  assert.ok(failed.trace.toasts.includes("启动接听脚本失败"));
  assert.match(joined(failed.trace.logs), /第1次/);
  assert.match(joined(failed.trace.logs), /第2次/);
});

test("mini-window script keeps the stricter invite check and the cooldown", () => {
  const { ctx, trace, error } = run("autox/open-wechat-on-call.js");
  assert.equal(error, null);
  assert.equal(ctx.isIncomingCall("邀请你视频通话"), true);
  assert.equal(ctx.isIncomingCall("邀请你语音通话"), true);
  assert.equal(ctx.isIncomingCall("有人邀请 视频通话"), true);
  assert.equal(ctx.isIncomingCall("视频通话"), false);
  assert.equal(ctx.isIncomingCall("未接语音通话邀请"), false);
  assert.equal(ctx.isIncomingCall("邀请你视频通话已取消"), false);
  assert.equal(ctx.isIncomingCall(""), false);
  assert.equal(ctx.isIncomingCall(null), false);
  assert.equal(trace.intervals.length, 1);
  assert.equal(trace.intervals[0].ms, 60000);
  assert.ok(trace.toasts.includes("来电开微信小窗：已在运行"));

  const call = note({ title: "邀请你视频通话" });
  ctx._on.notification(call);
  assert.equal(call.clicked, true);
  assert.deepEqual(trace.launches, ["pkg:com.tencent.mm"]);
  assert.equal(trace.clicks.length, 0);
  assert.match(joined(trace.logs), /找不到微信的启动入口/);
  assert.equal(joined(trace.logs).includes("邀请你视频通话"), false);

  const launched = trace.launches.length;
  ctx._advance(1000);
  ctx._on.notification(note({ title: "邀请你视频通话" }));
  assert.equal(trace.launches.length, launched);
  ctx._advance(8000);
  ctx._on.notification(note({ ticker: "邀请你语音通话" }));
  assert.equal(trace.launches.length, launched + 1);
});

test("mini-window failures fall back instead of dropping the call", () => {
  const brokenPackageManager = run("autox/open-wechat-on-call.js", (ctx) => {
    ctx.context.getPackageManager = () => {
      throw new Error("pm");
    };
  });
  assert.equal(brokenPackageManager.error, null);
  brokenPackageManager.ctx._on.notification(note({ title: "邀请你视频通话" }));
  assert.deepEqual(brokenPackageManager.trace.launches, ["pkg:com.tencent.mm"]);
  assert.match(joined(brokenPackageManager.trace.logs), /小窗打开失败/);

  const cannotLaunch = run("autox/open-wechat-on-call.js", (ctx) => {
    ctx.app.launchPackage = () => {
      throw new Error("denied");
    };
  });
  assert.doesNotThrow(() => {
    cannotLaunch.ctx._on.notification(note({ title: "邀请你语音通话" }));
  });
  assert.ok(cannotLaunch.trace.toasts.includes("打开微信失败，请手动打开"));
  assert.match(joined(cannotLaunch.trace.logs), /打开微信失败/);

  const ignored = run("autox/open-wechat-on-call.js");
  ignored.ctx._on.notification(null);
  ignored.ctx._on.notification(note({ pkg: "com.android.mms", title: "邀请你视频通话" }));
  ignored.ctx._on.notification({
    getPackageName() {
      throw new Error("pkg");
    },
  });
  ignored.ctx._on.notification(note({ titleError: new Error("title"), text: "邀请你视频通话" }));
  assert.equal(ignored.trace.launches.length, 1);
  assert.match(joined(ignored.trace.logs), /读取通知包名失败/);
  assert.match(joined(ignored.trace.logs), /读取通知标题失败/);
});

test("mini-window script stops after notification access keeps failing", () => {
  const { trace, error } = run("autox/open-wechat-on-call.js", (ctx) => {
    ctx._observeError = new Error("no listener");
  });
  assert.equal(trace.observeCalls, 3);
  assert.equal(trace.sleeps, 2);
  assert.equal(trace.intervals.length, 0);
  assert.equal(error && error.message, "no listener");
  assert.ok(trace.toasts.includes("请打开「通知使用权」，再重新运行本脚本"));
  assert.ok(
    trace.activities.some((item) => item.action === "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
  );
});
