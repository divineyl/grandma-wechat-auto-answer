"""Parse GKD json5 files and check auto-answer safety rails."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import json5

ROOT = Path(__file__).resolve().parents[1]

ENDED_MARKS = ["未接", "已结束", "已取消", "已拒绝", "已挂断", "通话时长", "对方已取消"]
INVITES = ["邀请你视频通话", "邀请你语音通话"]
CALL_CASES = [
    ("邀请你视频通话", True),
    ("妈妈 邀请你语音通话", True),
    ("对方邀请你视频通话", True),
    ("晚上要视频通话", False),
    ("语音通话", False),
    ("视频通话", False),
    ("未接视频通话", False),
    ("邀请你视频通话已取消", False),
    ("邀请你进行视频通话", False),
    ("已拒绝 邀请你语音通话", False),
    ("语音通话已结束", False),
    ("", False),
]


def is_call_notification(text: str, invites: list[str], ended: list[str]) -> bool:
    if not text or any(mark in text for mark in ended):
        return False
    return any(phrase in text for phrase in invites)


def group_rules(group: dict) -> list[dict]:
    rules = group["rules"]
    assert isinstance(rules, list)
    return rules


def assert_same_group(left: dict, right: dict) -> None:
    assert left == right


def assert_click_rule(rule: dict) -> None:
    assert "position" not in rule
    assert "swipeArg" not in rule
    assert rule.get("action") not in {"swipe", "longClick", "longClickCenter"}
    blob = json.dumps(rule, ensure_ascii=False)
    assert "发送" in blob
    for banned in ['desc*="接听"', 'desc*="扬声器"', 'text*="视频通话"', 'text*="语音通话"']:
        assert banned not in blob, banned
    assert "取消" not in blob.replace("已取消", ""), blob
    maximum = rule.get("actionMaximum")
    if maximum is not None:
        assert isinstance(maximum, int) and 1 <= maximum <= 2


def assert_answer_group(group: dict) -> None:
    assert group["key"] == 1
    assert group["enable"] is False
    assert "activityIds" not in group
    rules = group_rules(group)
    names = [rule["name"] for rule in rules]
    assert names == [
        "来电界面点接听",
        "来电界面点接听描述",
        "点邀请你视频通话",
        "点邀请你语音通话",
        "打开已关闭的扬声器",
    ]
    text_rule = rules[0]
    assert text_rule["matches"][0].startswith("[text=\"挂断\"")
    assert "接听" in text_rule["matches"][1]
    assert text_rule["actionMaximum"] == 2
    desc_rule = rules[1]
    assert desc_rule["actionMaximumKey"] == 0
    assert desc_rule["actionCdKey"] == 0
    assert desc_rule["fastQuery"] is False
    speaker = rules[-1]
    assert speaker["preKeys"] == [0, 1]
    assert "扬声器已关" in speaker["matches"]
    assert 2 not in speaker["preKeys"]
    assert 3 not in speaker["preKeys"]
    for rule in rules:
        assert_click_rule(rule)


def assert_banner(data: dict) -> None:
    assert data["key"] == 10
    assert data["enable"] is False
    assert data["matchSystemApp"] is True
    assert data["matchLauncher"] is True
    assert data["matchAnyApp"] is True
    assert data["actionMaximum"] == 2
    rules = group_rules(data)
    assert len(rules) == 2
    for rule in rules:
        assert_click_rule(rule)
        assert "邀请你" in rule["matches"]
        assert "text.length<=24" in rule["matches"]


def string_array(src: str, var_name: str) -> list[str]:
    match = re.search(var_name + r" = \[(.*?)\];", src, re.S)
    assert match, var_name
    return re.findall(r'"([^"]+)"', match.group(1))


def function_body(src: str, name: str) -> str:
    match = re.search(r"function " + name + r"\([^)]*\) \{", src)
    assert match, name
    start = match.end()
    depth = 1
    i = start
    while i < len(src) and depth:
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
        i += 1
    assert depth == 0
    return src[start : i - 1]


def assert_script(src: str) -> None:
    assert "var AUTO_ANSWER_ENABLED = false;" in src
    assert "var ALLOW_CALLER_NAMES = [];" in src
    assert "BEGIN SIDE EFFECTS" in src
    for banned in [
        "clickAnswerByPosition",
        'textContains("视频通话")',
        'textContains("语音通话")',
        'click("接听")',
        "w * 0.",
        "findExact(",
    ]:
        assert banned not in src, banned
    invites = [
        re.search(r'var INVITE_VIDEO = "([^"]+)";', src).group(1),
        re.search(r'var INVITE_VOICE = "([^"]+)";', src).group(1),
    ]
    ended = string_array(src, "ENDED_MARKS")
    assert invites == INVITES
    assert ended == ENDED_MARKS
    for text, expected in CALL_CASES:
        got = is_call_notification(text, invites, ended)
        assert got is expected, (text, got, expected)
    call_fn = function_body(src, "isCallText")
    assert "hasEndedMark(s)" in call_fn
    assert "INVITE_VIDEO" in call_fn and "INVITE_VOICE" in call_fn
    click_fn = function_body(src, "canClickNode")
    assert 'indexOf("发送")' in click_fn
    assert "WECHAT" in click_fn
    assert 'kind === "answer"' in click_fn
    side_effects = src.split("// BEGIN SIDE EFFECTS", 1)[1]
    assert "AUTO_ANSWER_ENABLED !== true" in side_effects
    assert "将接听所有微信来电" in side_effects
    assert "只接听名单中的联系人" in side_effects
    names_fn = function_body(src, "screenHasAllowedCaller")
    assert "findOnce" not in names_fn
    assert "pendingCallerOk" in names_fn


def assert_mini_script(src: str) -> None:
    assert "var ENABLED = false;" in src
    assert "ENABLED !== true" in src
    body = function_body(src, "isIncomingCall")
    for phrase in INVITES:
        assert phrase in body
    for mark in ("未接", "已结束", "已取消"):
        assert mark in body
    assert 'indexOf("视频通话") >= 0 && text.indexOf("邀请")' not in src


def main() -> int:
    try:
        sub = json5.loads((ROOT / "gkd" / "wechat-auto-answer.json5").read_text(encoding="utf-8"))
        app = json5.loads((ROOT / "gkd" / "app-rule-wechat.json5").read_text(encoding="utf-8"))
        banner = json5.loads(
            (ROOT / "gkd" / "global-incoming-banner.json5").read_text(encoding="utf-8")
        )
        assert sub["id"] == 20260908
        assert sub["version"] == 3
        assert sub["globalGroups"] == []
        assert app["id"] == "com.tencent.mm"
        assert_same_group(sub["apps"][0]["groups"][0], app["groups"][0])
        assert_answer_group(app["groups"][0])
        assert_banner(banner)
        script = (ROOT / "autox" / "auto-answer-fullscreen.js").read_text(encoding="utf-8")
        mini = (ROOT / "autox" / "open-wechat-on-call.js").read_text(encoding="utf-8")
        assert_script(script)
        assert_mini_script(mini)
        for text, expected in CALL_CASES:
            assert is_call_notification(text, INVITES, ENDED_MARKS) is expected
    except Exception as exc:
        print(f"FAIL {exc}", file=sys.stderr)
        return 1
    print("OK wechat-auto-answer.json5")
    print("OK app-rule-wechat.json5")
    print("OK global-incoming-banner.json5")
    print("OK auto-answer guardrails")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
