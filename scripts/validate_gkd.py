"""Parse GKD json5 files with the json5 package."""

from __future__ import annotations

import sys
from pathlib import Path

import json5

ROOT = Path(__file__).resolve().parents[1]


def check_subscription(data: object) -> None:
    assert isinstance(data, dict)
    assert data["id"] == 20260908
    app = data["apps"][0]
    assert app["id"] == "com.tencent.mm"
    group = app["groups"][0]
    assert group["enable"] is True
    assert "activityIds" not in group
    names = [r["name"] for r in group["rules"]]
    assert "点带接听字样的按钮" in names
    assert "点邀请你视频通话" in names
    assert group["rules"][-1]["preKeys"] == [0, 1, 2, 3]


def check_app_rule(data: object) -> None:
    assert isinstance(data, dict)
    assert data["id"] == "com.tencent.mm"
    group = data["groups"][0]
    assert group["key"] == 1
    assert "activityIds" not in group
    assert group["rules"][-1]["preKeys"] == [0, 1, 2, 3]


def main() -> int:
    try:
        sub = json5.loads(
            (ROOT / "gkd" / "wechat-auto-answer.json5").read_text(encoding="utf-8")
        )
        app = json5.loads(
            (ROOT / "gkd" / "app-rule-wechat.json5").read_text(encoding="utf-8")
        )
        glob = json5.loads(
            (ROOT / "gkd" / "global-incoming-banner.json5").read_text(encoding="utf-8")
        )
        check_subscription(sub)
        check_app_rule(app)
        assert glob["key"] == 10
        assert glob["matchSystemApp"] is True
        assert glob["matchLauncher"] is True
        assert glob["matchAnyApp"] is True
    except Exception as exc:
        print(f"FAIL {exc}", file=sys.stderr)
        return 1
    print("OK wechat-auto-answer.json5")
    print("OK app-rule-wechat.json5")
    print("OK global-incoming-banner.json5")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
