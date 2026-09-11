/**
 * 开机/AutoJs6 启动后拉起全屏接听脚本。
 * 若主脚本已在运行，不会再开一份。
 */
var MAIN = files.join(files.cwd(), "auto-answer-fullscreen.js");
if (!files.exists(MAIN)) {
    MAIN = files.join("/sdcard/脚本", "auto-answer-fullscreen.js");
}
if (!files.exists(MAIN)) {
    toast("找不到 auto-answer-fullscreen.js");
    exit();
}

var running = engines.all();
var i;
for (i = 0; i < running.length; i++) {
    var src = running[i].getSource();
    if (src && ("" + src).indexOf("auto-answer-fullscreen") >= 0) {
        toast("接听脚本已在运行");
        exit();
    }
}

engines.execScriptFile(MAIN);
