"""The fullscreen script must refuse to start until the preflight passes."""

from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = (ROOT / "autox" / "auto-answer-fullscreen.js").read_text(encoding="utf-8")
PREFLIGHT = (ROOT / "autox" / "preflight.js").read_text(encoding="utf-8")


class PreflightWiringTest(unittest.TestCase):
    def test_gate_runs_before_answering(self) -> None:
        gate = SCRIPT.index("Preflight.resolvePreflight")
        allow = SCRIPT.index("autoAnswerAllowed = true")
        stop = SCRIPT.index("exit();")
        start = SCRIPT.index("waitAccessibility();")
        listen = SCRIPT.index("events.observeNotification")
        loop = SCRIPT.index("setInterval")
        self.assertLess(gate, allow)
        self.assertLess(allow, stop)
        self.assertLess(stop, start)
        self.assertLess(start, listen)
        self.assertLess(listen, loop)
        self.assertLess(SCRIPT.rindex("exit();"), start)
        self.assertIn("preflightDecision.ok === true", SCRIPT)
        self.assertEqual(SCRIPT.count("autoAnswerAllowed = true"), 1)
        self.assertGreaterEqual(SCRIPT.count("autoAnswerAllowed !== true"), 3)

    def test_preflight_cannot_tap_or_treat_chat_text_as_a_call(self) -> None:
        self.assertNotIn("click(", PREFLIGHT)
        self.assertNotIn("press(", PREFLIGHT)
        self.assertNotIn("0.75", PREFLIGHT)
        self.assertNotIn("0.82", PREFLIGHT)
        self.assertNotIn("视频通话", PREFLIGHT)
        self.assertNotIn("语音通话", PREFLIGHT)
        self.assertNotIn("发送", PREFLIGHT)

    def test_user_facing_words_are_present(self) -> None:
        for phrase in (
            "还不能自动接听",
            "无障碍",
            "通知使用权",
            "悬浮窗",
            "无限制",
            "省电模式",
            "com.tencent.mm",
        ):
            self.assertIn(phrase, PREFLIGHT)
        self.assertIn("com.tencent.mm", SCRIPT)
        self.assertIn("preflight.js", SCRIPT)

    def test_docs_tell_the_family_what_the_stop_means(self) -> None:
        started = (ROOT / "docs" / "getting-started.md").read_text(encoding="utf-8")
        trouble = (ROOT / "docs" / "troubleshooting.md").read_text(encoding="utf-8")
        checklist = (ROOT / "docs" / "checklist.md").read_text(encoding="utf-8")
        self.assertIn("preflight.js", started)
        self.assertIn("还不能自动接听", started)
        self.assertIn("还不能自动接听", trouble)
        self.assertIn("还不能自动接听", checklist)


if __name__ == "__main__":
    unittest.main()
