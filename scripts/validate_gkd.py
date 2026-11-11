"""Parse GKD json5 files and reject rules that click too widely."""

from __future__ import annotations

import sys
from pathlib import Path

import json5

ROOT = Path(__file__).resolve().parents[1]

ANSWER_RULE_NAMES = [
    "点带接听字样的按钮",
    "点文字接听",
    "点邀请你视频通话",
    "点邀请你语音通话",
    "打开扬声器",
]
GLOBAL_RULE_NAMES = [
    "点邀请你视频通话",
    "点邀请你语音通话",
]
# Selectors must name one of these. A bare「邀请」or「通话」would hit unrelated buttons.
SPECIFIC_TARGETS = ("接听", "邀请你视频通话", "邀请你语音通话", "扬声器")
# These words mean "end the call" or "this call is already over".
BLOCKED_TARGETS = ("挂断", "拒绝", "取消", "未接", "未接通", "已结束", "已取消", "已拒绝")
ANSWER_PRE_KEYS = [0, 1, 2, 3]
MIN_ACTION_DELAY = 200
MAX_GLOBAL_ACTIONS = 6
MAX_MATCH_TIME = 20000


class RuleError(Exception):
    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__("; ".join(errors))


class Checker:
    def __init__(self) -> None:
        self.errors: list[str] = []

    def check(self, condition: bool, message: str) -> None:
        if not condition:
            self.errors.append(message)

    def raise_if_any(self) -> None:
        if self.errors:
            raise RuleError(self.errors)


def is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def load_json5(path: Path) -> object:
    if not path.is_file():
        raise RuleError([f"找不到文件 {path}"])
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise RuleError([f"无法读取 {path}: {exc}"]) from exc
    if not text.strip():
        raise RuleError([f"{path.name} 是空文件"])
    try:
        return json5.loads(text)
    except Exception as exc:
        raise RuleError([f"无法解析 {path.name}: {exc}"]) from exc


def check_delay(rule: dict, checker: Checker) -> None:
    name = rule.get("name", "?")
    delay = rule.get("actionDelay")
    checker.check(
        is_int(delay) and delay >= MIN_ACTION_DELAY,
        f"规则「{name}」的 actionDelay 必须是不小于 {MIN_ACTION_DELAY} 的整数",
    )


def check_matches(rule: dict, checker: Checker) -> None:
    name = rule.get("name", "?")
    matches = rule.get("matches")
    checker.check(isinstance(matches, str) and bool(matches.strip()), f"规则「{name}」缺少 matches")
    if not isinstance(matches, str):
        return
    checker.check("[" in matches and "]" in matches, f"规则「{name}」的 matches 不是选择器")
    checker.check(
        "visibleToUser=true" in matches,
        f"规则「{name}」必须带 visibleToUser=true，避免点到屏幕外的控件",
    )
    checker.check(
        any(target in matches for target in SPECIFIC_TARGETS),
        f"规则「{name}」的匹配范围太宽",
    )
    for blocked in BLOCKED_TARGETS:
        checker.check(blocked not in matches, f"规则「{name}」不应匹配「{blocked}」")


def check_optional_cap(data: dict, checker: Checker, field: str, upper: int) -> None:
    if field not in data:
        return
    value = data.get(field)
    checker.check(
        is_int(value) and 1 <= value <= upper,
        f"{field} 必须在 1 到 {upper} 之间",
    )


def check_answer_rules(rules: object, checker: Checker) -> None:
    checker.check(isinstance(rules, list) and bool(rules), "缺少接听规则")
    if not isinstance(rules, list):
        return
    names: list[object] = []
    keys: list[object] = []
    for rule in rules:
        if not isinstance(rule, dict):
            checker.errors.append("规则必须是对象")
            continue
        name = rule.get("name", "?")
        names.append(rule.get("name"))
        checker.check("key" in rule, f"规则「{name}」缺少 key")
        checker.check(rule.get("key") not in keys, f"规则 key 重复: {rule.get('key')}")
        keys.append(rule.get("key"))
        check_matches(rule, checker)
        check_delay(rule, checker)
        is_speaker = "扬声器" in str(rule.get("name", "")) or "扬声器" in str(rule.get("matches", ""))
        if is_speaker:
            checker.check(
                rule.get("preKeys") == ANSWER_PRE_KEYS,
                "打开扬声器必须等前面的接听规则先命中（preKeys 0,1,2,3）",
            )
        elif "preKeys" in rule:
            checker.check(False, f"规则「{name}」不应该带 preKeys")
    checker.check(names == ANSWER_RULE_NAMES, "接听规则数量或顺序不能改，避免多点或漏点")
    known = set(keys)
    checker.check(set(ANSWER_PRE_KEYS) <= known, "扬声器的 preKeys 指向了不存在的规则")
    if rules and isinstance(rules[-1], dict):
        checker.check(
            rules[-1].get("preKeys") == ANSWER_PRE_KEYS,
            "最后一条必须是带 preKeys 的扬声器规则",
        )


def check_answer_group(group: object, checker: Checker, *, require_enable: bool) -> None:
    checker.check(isinstance(group, dict), "规则组必须是对象")
    if not isinstance(group, dict):
        return
    checker.check(group.get("key") == 1, "微信规则组 key 必须是 1")
    checker.check("activityIds" not in group, "不要用 activityIds 把接听限制在某一个页面")
    checker.check(group.get("matchAnyApp") is not True, "微信规则不能 matchAnyApp")
    if require_enable:
        checker.check(group.get("enable") is True, "接听规则组必须保持开启")
    check_optional_cap(group, checker, "actionMaximum", MAX_GLOBAL_ACTIONS)
    check_optional_cap(group, checker, "matchTime", MAX_MATCH_TIME)
    check_answer_rules(group.get("rules"), checker)


def check_subscription(data: object) -> None:
    checker = Checker()
    checker.check(isinstance(data, dict), "订阅必须是对象")
    if not isinstance(data, dict):
        checker.raise_if_any()
        return
    checker.check(data.get("id") == 20260908, "订阅 id 必须是 20260908")
    apps = data.get("apps")
    checker.check(isinstance(apps, list) and len(apps) == 1, "订阅里只能有微信这一条应用规则")
    if isinstance(apps, list) and apps:
        app = apps[0]
        checker.check(isinstance(app, dict), "应用规则必须是对象")
        if isinstance(app, dict):
            checker.check(app.get("id") == "com.tencent.mm", "应用必须是微信 com.tencent.mm")
            groups = app.get("groups")
            checker.check(isinstance(groups, list) and len(groups) == 1, "只能有一组接听规则")
            if isinstance(groups, list) and groups:
                check_answer_group(groups[0], checker, require_enable=True)
    checker.raise_if_any()


def check_app_rule(data: object) -> None:
    checker = Checker()
    checker.check(isinstance(data, dict), "应用规则必须是对象")
    if not isinstance(data, dict):
        checker.raise_if_any()
        return
    checker.check(data.get("id") == "com.tencent.mm", "应用必须是微信 com.tencent.mm")
    groups = data.get("groups")
    checker.check(isinstance(groups, list) and len(groups) == 1, "只能有一组接听规则")
    if isinstance(groups, list) and groups:
        check_answer_group(groups[0], checker, require_enable=True)
    checker.raise_if_any()


def check_global(data: object) -> None:
    checker = Checker()
    checker.check(isinstance(data, dict), "全局规则必须是对象")
    if not isinstance(data, dict):
        checker.raise_if_any()
        return
    checker.check(data.get("key") == 10, "全局规则 key 必须是 10")
    checker.check(data.get("enable") is True, "全局规则必须保持开启")
    checker.check(data.get("matchSystemApp") is True, "全局规则要能匹配系统界面")
    checker.check(data.get("matchLauncher") is True, "全局规则要能匹配桌面")
    checker.check(data.get("matchAnyApp") is True, "全局规则要能在微信不在前台时匹配")
    maximum = data.get("actionMaximum")
    checker.check(
        is_int(maximum) and 1 <= maximum <= MAX_GLOBAL_ACTIONS,
        f"全局规则 actionMaximum 必须在 1 到 {MAX_GLOBAL_ACTIONS} 之间",
    )
    match_time = data.get("matchTime")
    checker.check(
        is_int(match_time) and 1 <= match_time <= MAX_MATCH_TIME,
        f"全局规则 matchTime 必须在 1 到 {MAX_MATCH_TIME} 之间",
    )
    rules = data.get("rules")
    checker.check(isinstance(rules, list) and bool(rules), "全局规则缺少步骤")
    if isinstance(rules, list):
        names: list[object] = []
        keys: list[object] = []
        for rule in rules:
            if not isinstance(rule, dict):
                checker.errors.append("全局规则的步骤必须是对象")
                continue
            name = rule.get("name", "?")
            names.append(rule.get("name"))
            checker.check(rule.get("key") not in keys, f"全局规则 key 重复: {rule.get('key')}")
            keys.append(rule.get("key"))
            check_matches(rule, checker)
            check_delay(rule, checker)
            matches = str(rule.get("matches", ""))
            checker.check("邀请你" in matches and "通话" in matches, f"全局规则「{name}」只能点邀请通话横幅")
            checker.check("接听" not in matches, f"全局规则「{name}」不要直接点接听，避免点到其它应用")
            checker.check("扬声器" not in matches, f"全局规则「{name}」不要点扬声器")
            checker.check("preKeys" not in rule, f"全局规则「{name}」不应该带 preKeys")
        checker.check(names == GLOBAL_RULE_NAMES, "全局规则数量或顺序不能改")
    checker.raise_if_any()


def answer_rules_of(subscription: dict, app_rule: dict) -> tuple[object, object]:
    return (
        subscription["apps"][0]["groups"][0]["rules"],
        app_rule["groups"][0]["rules"],
    )


def check_same_answer_rules(subscription: dict, app_rule: dict) -> None:
    try:
        left, right = answer_rules_of(subscription, app_rule)
    except (KeyError, IndexError, TypeError) as exc:
        raise RuleError([f"无法比较两份接听规则: {exc}"]) from exc
    if left != right:
        raise RuleError(["订阅和应用规则的接听步骤不一致，避免两处各点各的"])


def validate_repo(root: Path | None = None) -> list[str]:
    root = root or ROOT
    errors: list[str] = []
    loaded: dict[str, object] = {}
    specs = (
        ("wechat-auto-answer.json5", check_subscription),
        ("app-rule-wechat.json5", check_app_rule),
        ("global-incoming-banner.json5", check_global),
    )
    for name, checker in specs:
        path = root / "gkd" / name
        try:
            data = load_json5(path)
            checker(data)
            loaded[name] = data
        except RuleError as exc:
            errors.append(f"{name}: {exc}")
        except Exception as exc:
            errors.append(f"{name}: 未预期的错误 {type(exc).__name__}: {exc}")
    sub_name = "wechat-auto-answer.json5"
    app_name = "app-rule-wechat.json5"
    if sub_name in loaded and app_name in loaded:
        try:
            check_same_answer_rules(loaded[sub_name], loaded[app_name])  # type: ignore[arg-type]
        except RuleError as exc:
            errors.append(f"规则不一致: {exc}")
        except Exception as exc:
            errors.append(f"规则不一致: 未预期的错误 {type(exc).__name__}: {exc}")
    return errors


def main(root: Path | None = None) -> int:
    errors = validate_repo(root)
    if errors:
        for err in errors:
            print(f"FAIL {err}", file=sys.stderr)
        return 1
    print("OK wechat-auto-answer.json5")
    print("OK app-rule-wechat.json5")
    print("OK global-incoming-banner.json5")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
