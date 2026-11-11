"""Failure modes for the GKD rule validator."""

from __future__ import annotations

import contextlib
import copy
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import validate_gkd  # noqa: E402


def load_rule(name: str) -> dict:
    return json.loads(json.dumps(validate_gkd.load_json5(ROOT / "gkd" / name)))


class ValidateGkdTest(unittest.TestCase):
    def test_real_repo_passes_and_prints_each_file(self) -> None:
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = validate_gkd.main()
        self.assertEqual(code, 0)
        self.assertEqual(stderr.getvalue(), "")
        text = stdout.getvalue()
        self.assertIn("OK wechat-auto-answer.json5", text)
        self.assertIn("OK app-rule-wechat.json5", text)
        self.assertIn("OK global-incoming-banner.json5", text)

    def test_cli_exits_zero(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "validate_gkd.py")],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn("OK app-rule-wechat.json5", completed.stdout)

    def test_subscription_and_app_rules_match(self) -> None:
        sub = load_rule("wechat-auto-answer.json5")
        app = load_rule("app-rule-wechat.json5")
        validate_gkd.check_same_answer_rules(sub, app)

    def test_missing_file_names_the_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            errors = validate_gkd.validate_repo(Path(tmp))
        self.assertEqual(len(errors), 3)
        self.assertTrue(all("找不到文件" in err for err in errors))

    def test_empty_file_is_reported(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            gkd = root / "gkd"
            shutil.copytree(ROOT / "gkd", gkd)
            (gkd / "global-incoming-banner.json5").write_text("\n", encoding="utf-8")
            errors = validate_gkd.validate_repo(root)
        self.assertTrue(any("空文件" in err for err in errors))

    def test_malformed_json5_does_not_raise(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            gkd = root / "gkd"
            shutil.copytree(ROOT / "gkd", gkd)
            (gkd / "app-rule-wechat.json5").write_text("{ this is not json5", encoding="utf-8")
            stdout = io.StringIO()
            stderr = io.StringIO()
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = validate_gkd.main(root)
        self.assertEqual(code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("无法解析 app-rule-wechat.json5", stderr.getvalue())
        self.assertNotIn("Traceback", stderr.getvalue())

    def test_directory_instead_of_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "rules.json5"
            path.mkdir()
            with self.assertRaises(validate_gkd.RuleError) as caught:
                validate_gkd.load_json5(path)
        self.assertIn("找不到文件", str(caught.exception))

    def test_rejects_hangup_selector(self) -> None:
        data = load_rule("app-rule-wechat.json5")
        data["groups"][0]["rules"][0]["matches"] = '[desc*="挂断"][visibleToUser=true]'
        with self.assertRaises(validate_gkd.RuleError) as caught:
            validate_gkd.check_app_rule(data)
        self.assertIn("挂断", str(caught.exception))

    def test_rejects_missed_call_selector(self) -> None:
        data = load_rule("wechat-auto-answer.json5")
        data["apps"][0]["groups"][0]["rules"][2]["matches"] = '[text*="未接视频通话"][visibleToUser=true]'
        with self.assertRaises(validate_gkd.RuleError) as caught:
            validate_gkd.check_subscription(data)
        self.assertIn("未接", str(caught.exception))

    def test_rejects_offscreen_selector(self) -> None:
        data = load_rule("app-rule-wechat.json5")
        data["groups"][0]["rules"][1]["matches"] = '[text="接听"]'
        with self.assertRaises(validate_gkd.RuleError) as caught:
            validate_gkd.check_app_rule(data)
        self.assertIn("visibleToUser=true", str(caught.exception))

    def test_rejects_broad_selector(self) -> None:
        data = load_rule("app-rule-wechat.json5")
        data["groups"][0]["rules"][1]["matches"] = "[visibleToUser=true]"
        with self.assertRaises(validate_gkd.RuleError) as caught:
            validate_gkd.check_app_rule(data)
        self.assertIn("太宽", str(caught.exception))

    def test_rejects_zero_delay(self) -> None:
        data = load_rule("app-rule-wechat.json5")
        data["groups"][0]["rules"][1]["actionDelay"] = 0
        with self.assertRaises(validate_gkd.RuleError) as caught:
            validate_gkd.check_app_rule(data)
        self.assertIn("actionDelay", str(caught.exception))

    def test_rejects_boolean_delay(self) -> None:
        data = load_rule("app-rule-wechat.json5")
        data["groups"][0]["rules"][1]["actionDelay"] = True
        with self.assertRaises(validate_gkd.RuleError) as caught:
            validate_gkd.check_app_rule(data)
        self.assertIn("actionDelay", str(caught.exception))

    def test_speaker_cannot_drop_prekeys(self) -> None:
        data = load_rule("app-rule-wechat.json5")
        data["groups"][0]["rules"][-1].pop("preKeys")
        with self.assertRaises(validate_gkd.RuleError) as caught:
            validate_gkd.check_app_rule(data)
        self.assertIn("preKeys", str(caught.exception))

    def test_rejects_extra_click_rule(self) -> None:
        data = load_rule("app-rule-wechat.json5")
        extra = copy.deepcopy(data["groups"][0]["rules"][1])
        extra["key"] = 9
        extra["name"] = "再点一次接听"
        data["groups"][0]["rules"].append(extra)
        with self.assertRaises(validate_gkd.RuleError) as caught:
            validate_gkd.check_app_rule(data)
        self.assertIn("数量或顺序不能改", str(caught.exception))

    def test_rejects_second_app(self) -> None:
        data = load_rule("wechat-auto-answer.json5")
        data["apps"].append({"id": "com.example.other", "groups": []})
        with self.assertRaises(validate_gkd.RuleError) as caught:
            validate_gkd.check_subscription(data)
        self.assertIn("只能有微信", str(caught.exception))

    def test_rejects_high_global_action_cap(self) -> None:
        data = load_rule("global-incoming-banner.json5")
        data["actionMaximum"] = 7
        with self.assertRaises(validate_gkd.RuleError) as caught:
            validate_gkd.check_global(data)
        self.assertIn("actionMaximum", str(caught.exception))

    def test_allows_lower_global_action_cap(self) -> None:
        data = load_rule("global-incoming-banner.json5")
        data["actionMaximum"] = 1
        validate_gkd.check_global(data)

    def test_rejects_longer_global_match_time(self) -> None:
        data = load_rule("global-incoming-banner.json5")
        data["matchTime"] = 20001
        with self.assertRaises(validate_gkd.RuleError) as caught:
            validate_gkd.check_global(data)
        self.assertIn("matchTime", str(caught.exception))

    def test_global_rule_cannot_click_answer_or_speaker(self) -> None:
        data = load_rule("global-incoming-banner.json5")
        data["rules"][0]["matches"] = '[text="接听"][visibleToUser=true]'
        with self.assertRaises(validate_gkd.RuleError) as caught:
            validate_gkd.check_global(data)
        message = str(caught.exception)
        self.assertIn("接听", message)
        self.assertIn("邀请通话横幅", message)

    def test_app_group_cannot_match_any_app(self) -> None:
        data = load_rule("app-rule-wechat.json5")
        data["groups"][0]["matchAnyApp"] = True
        with self.assertRaises(validate_gkd.RuleError) as caught:
            validate_gkd.check_app_rule(data)
        self.assertIn("matchAnyApp", str(caught.exception))

    def test_optional_cap_on_answer_group_is_bounded(self) -> None:
        data = load_rule("app-rule-wechat.json5")
        data["groups"][0]["actionMaximum"] = 100
        with self.assertRaises(validate_gkd.RuleError) as caught:
            validate_gkd.check_app_rule(data)
        self.assertIn("actionMaximum", str(caught.exception))

    def test_drift_between_subscription_and_app_rule(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            gkd = root / "gkd"
            shutil.copytree(ROOT / "gkd", gkd)
            path = gkd / "app-rule-wechat.json5"
            path.write_text(
                path.read_text(encoding="utf-8").replace("actionDelay: 400", "actionDelay: 500", 1),
                encoding="utf-8",
            )
            errors = validate_gkd.validate_repo(root)
        self.assertTrue(any("不一致" in err for err in errors), errors)

    def test_duplicate_global_keys(self) -> None:
        data = load_rule("global-incoming-banner.json5")
        data["rules"][1]["key"] = data["rules"][0]["key"]
        with self.assertRaises(validate_gkd.RuleError) as caught:
            validate_gkd.check_global(data)
        self.assertIn("key 重复", str(caught.exception))

    def test_not_an_object(self) -> None:
        with self.assertRaises(validate_gkd.RuleError) as caught:
            validate_gkd.check_subscription([])
        self.assertIn("订阅必须是对象", str(caught.exception))
        with self.assertRaises(validate_gkd.RuleError):
            validate_gkd.check_app_rule("微信")
        with self.assertRaises(validate_gkd.RuleError):
            validate_gkd.check_global(None)


if __name__ == "__main__":
    unittest.main()
