"""The running fullscreen script must stop tapping when access drops."""

from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = (ROOT / "autox" / "auto-answer-fullscreen.js").read_text(encoding="utf-8")
WATCH = (ROOT / "autox" / "access-watch.js").read_text(encoding="utf-8")


def function_body(src: str, name: str) -> str:
    marker = f"function {name}("
    start = src.index(marker)
    brace = src.index("{", start)
    depth = 0
    for index in range(brace, len(src)):
        char = src[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return src[brace : index + 1]
    raise AssertionError(name)


def assert_checked_before_each_click(test: unittest.TestCase, body: str) -> None:
    parts = body.split("click(")
    test.assertGreaterEqual(len(parts), 2)
    for part in parts[:-1]:
        test.assertIn("accessStillAllows", part)


class AccessWatchWiringTest(unittest.TestCase):
    def test_every_tap_is_behind_the_access_check(self) -> None:
        assert_checked_before_each_click(self, function_body(SCRIPT, "clickNode"))
        assert_checked_before_each_click(self, function_body(SCRIPT, "findAnswer"))
        assert_checked_before_each_click(self, function_body(SCRIPT, "clickAnswerByPosition"))
        self.assertEqual(function_body(SCRIPT, "clickAnswerByPosition").count("click("), 3)
        wake = function_body(SCRIPT, "wakeAndOpenWeChat")
        assert_checked_before_each_click(self, wake)
        self.assertLess(wake.index("accessStillAllows"), wake.index("n.click"))
        self.assertLess(wake.rindex("accessStillAllows"), wake.index("launchApp"))

        answer = function_body(SCRIPT, "tryAnswerOnce")
        self.assertLess(answer.index("accessStillAllows"), answer.index("findBanner"))
        self.assertLess(answer.index("accessStillAllows"), answer.index("findAnswer"))
        self.assertLess(answer.index("accessStillAllows"), answer.index("clickAnswerByPosition"))

        incoming = function_body(SCRIPT, "onMaybeCall")
        self.assertLess(incoming.index("accessStillAllows"), incoming.index("isCallText"))
        self.assertLess(incoming.rindex("accessStillAllows"), incoming.index("pendingUntil"))
        self.assertLess(incoming.rindex("accessStillAllows"), incoming.index("wakeAndOpenWeChat"))

    def test_running_starts_only_after_a_passing_check(self) -> None:
        gate = SCRIPT.index("if (accessStillAllows())")
        running = SCRIPT.index("全屏自动接听运行中")
        self.assertLess(gate, running)
        self.assertNotIn("全屏自动接听运行中", SCRIPT[:gate])
        self.assertIn("pendingUntil = 0", SCRIPT[:gate])
        self.assertIn("clearInterval(answerTimer)", SCRIPT[:gate])
        self.assertIn("access-watch.js", SCRIPT)
        self.assertIn("自动接听已经停了", SCRIPT)
        # Five global click() calls, plus node.click() and n.click(), same as before this guard.
        self.assertEqual(SCRIPT.count("click("), 7)
        self.assertEqual(SCRIPT.count("0.75"), 1)
        self.assertEqual(SCRIPT.count("0.82"), 1)
        self.assertNotIn("swipe(", SCRIPT)
        self.assertNotIn("press(", SCRIPT)
        self.assertNotIn("gesture(", SCRIPT)

    def test_call_text_rules_are_unchanged(self) -> None:
        body = function_body(SCRIPT, "isCallText")
        self.assertIn('indexOf("邀请你视频通话")', body)
        self.assertIn('indexOf("邀请你语音通话")', body)
        self.assertIn('indexOf("视频通话")', body)
        self.assertIn('indexOf("语音通话")', body)
        self.assertNotIn("发送", body)
        self.assertNotIn("accessStillAllows", body)

    def test_watch_module_cannot_tap(self) -> None:
        for token in ("click(", "swipe(", "press(", "gesture(", "0.75", "0.82", "视频通话", "发送"):
            self.assertNotIn(token, WATCH)
        self.assertIn("自动接听已经停了", WATCH)
        self.assertIn("enabled_accessibility_services", WATCH)
        self.assertIn("accessibility_enabled", WATCH)
        self.assertIn("enabled_notification_listeners", WATCH)
        self.assertIn("android.settings.ACCESSIBILITY_SETTINGS", WATCH)
        self.assertIn("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS", WATCH)

    def test_docs_tell_the_family_that_answering_stopped(self) -> None:
        docs = {
            "README.md": ROOT / "README.md",
            "autox": ROOT / "autox" / "README.md",
            "started": ROOT / "docs" / "getting-started.md",
            "trouble": ROOT / "docs" / "troubleshooting.md",
            "checklist": ROOT / "docs" / "checklist.md",
            "xiaomi": ROOT / "docs" / "xiaomi.md",
            "keep": ROOT / "docs" / "keep-running.md",
            "security": ROOT / "SECURITY.md",
        }
        text = {name: path.read_text(encoding="utf-8") for name, path in docs.items()}
        for name in ("autox", "started", "trouble", "checklist", "xiaomi", "keep", "security"):
            self.assertIn("自动接听已经停了", text[name], name)
        for name in ("README.md", "autox", "started", "keep"):
            self.assertIn("access-watch.js", text[name], name)
        self.assertIn("不会再点屏幕", text["trouble"])
        self.assertIn("通知使用权", text["trouble"])
        self.assertNotIn("HyperOS", text["xiaomi"])
        self.assertNotIn("澎湃", text["trouble"])


if __name__ == "__main__":
    unittest.main()
