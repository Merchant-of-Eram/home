"""
eram_export.py — write an episode's backtest results into the ERAM website's data files.

It creates data/epXX.json (full results, read by the detail view and charts) and updates
that episode's entry in data/tests.json (the verdict board). Standard library only; pandas
Series/DataFrames are accepted but not required.

Usage, at the end of your backtest script (after you have the numbers):

    from eram_export import write_episode

    write_episode(
        site_dir=r"C:\\ERAM\\askeram.github.io",
        ep=1,
        claim="Buy when RSI drops below 30",
        verdict="fools",                                  # "gold" | "fools" | "ore"
        summary="One or two sentences on what happened.",
        metrics={                                         # shown as a table, one column per timeframe
            "1d": {"Total trades": "412", "Win rate": "46.2%", "Net P&L after fees": "-12.4%"},
            "4h": {"Total trades": "1,380", "Win rate": "44.0%", "Net P&L after fees": "-19.8%"},
        },
        main_timeframe="1d",                              # used by the Compare section
        card_stats={"Coins": "30", "Trades": "412", "Period": "2021-2026", "Net after fees": "-12.4%"},
        net_pct=-12.4,                                    # number, used to sort the board
        equity={
            "dates": equity_strategy.index,               # list of dates or a pandas DatetimeIndex
            "strategy": equity_strategy,                  # list of numbers or a pandas Series
            "buy_hold": equity_buy_hold,
            "random": equity_random,
            "unit_label": "Portfolio value ($)",
        },
        per_coin={"BTCUSDT": 3.1, "ETHUSDT": -8.2},       # coin -> net result
        by_year={"2021": 5.0, "2022": -21.3, "2023-26": 3.9},
        pnl_unit="%",                                     # "%" or "$", for per_coin and by_year
        video="https://youtu.be/...",
        code="https://github.com/merchant-of-eram/eram-tests/tree/main/ep01-rsi-below-30",
        limitations=["Delisted coins are not included.", "Slippage is not modelled."],
    )

Then, in the website folder:  git add .  &&  git commit -m "Episode 1 results"  &&  git push

Every number you pass must come from your own test run.
"""
from __future__ import annotations

import json
import math
import os
import tempfile
from datetime import date, datetime
from typing import Any, Iterable, Mapping

VERDICTS = {"gold", "fools", "ore"}
MAX_POINTS = 400  # equity curves are thinned to this many points so the page stays fast


def _to_list(values: Any) -> list:
    """Accept a list, tuple, numpy array, pandas Series/Index; return a plain list."""
    if values is None:
        return []
    if hasattr(values, "tolist"):
        return list(values.tolist())
    return list(values)


def _date_str(d: Any) -> str:
    if isinstance(d, (datetime, date)):
        return d.strftime("%Y-%m-%d")
    if hasattr(d, "strftime"):  # pandas Timestamp
        return d.strftime("%Y-%m-%d")
    if isinstance(d, (int, float)) and d > 1e11:  # epoch milliseconds
        return datetime.utcfromtimestamp(d / 1000).strftime("%Y-%m-%d")
    return str(d)


def _num(x: Any, digits: int = 2) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(v) or math.isinf(v) else round(v, digits)


def _thin(n: int, max_points: int) -> list[int]:
    """Indices of evenly spaced points, always keeping the first and last."""
    if n <= max_points:
        return list(range(n))
    step = (n - 1) / (max_points - 1)
    return sorted({round(i * step) for i in range(max_points)})


def _pairs(obj: Mapping | Iterable | None, key: str) -> list[dict] | None:
    if obj is None:
        return None
    if isinstance(obj, Mapping) or hasattr(obj, "items"):
        items = obj.items()
    else:
        items = obj
    out = []
    for label, val in items:
        v = _num(val)
        if v is not None:
            out.append({key: str(label), "pnl": v})
    return out


def _write_json(path: str, data: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def write_episode(
    site_dir: str,
    ep: int,
    claim: str,
    verdict: str,
    summary: str,
    metrics: Mapping[str, Mapping[str, Any]],
    *,
    main_timeframe: str | None = None,
    card_stats: Mapping[str, Any] | None = None,
    net_pct: float | None = None,
    equity: Mapping[str, Any] | None = None,
    per_coin: Mapping[str, float] | Iterable | None = None,
    by_year: Mapping[str, float] | Iterable | None = None,
    pnl_unit: str = "%",
    rules: Mapping[str, Any] | None = None,
    video: str = "",
    code: str = "",
    limitations: Iterable[str] | None = None,
) -> str:
    """Write data/epXX.json and update data/tests.json. Returns the episode file path."""
    if verdict not in VERDICTS:
        raise ValueError(f"verdict must be one of {sorted(VERDICTS)}, got {verdict!r}")
    if pnl_unit not in ("%", "$"):
        raise ValueError('pnl_unit must be "%" or "$"')

    data_dir = os.path.join(site_dir, "data")
    index_path = os.path.join(data_dir, "tests.json")
    ep_file = f"ep{int(ep):02d}.json"

    # Keep rules already listed on the board if none are passed.
    index = {"tests": []}
    if os.path.exists(index_path):
        with open(index_path, encoding="utf-8") as f:
            index = json.load(f)
    entry = next((t for t in index.get("tests", []) if int(t.get("ep", -1)) == int(ep)), None)
    if rules is None and entry and entry.get("rules"):
        rules = entry["rules"]

    episode: dict[str, Any] = {
        "ep": int(ep),
        "claim": claim,
        "verdict": verdict,
        "summary": summary,
        "main_timeframe": main_timeframe or next(iter(metrics), None),
        "metrics": {tf: {str(k): str(v) for k, v in m.items()} for tf, m in metrics.items()},
        "pnl_unit": pnl_unit,
        "video": video,
        "code": code,
    }

    if equity:
        dates = [_date_str(d) for d in _to_list(equity.get("dates"))]
        series = {k: _to_list(equity.get(k)) for k in ("strategy", "buy_hold", "random") if equity.get(k) is not None}
        for k, v in series.items():
            if len(v) != len(dates):
                raise ValueError(f"equity[{k!r}] has {len(v)} values but there are {len(dates)} dates")
        keep = _thin(len(dates), MAX_POINTS)
        episode["equity"] = {"dates": [dates[i] for i in keep]}
        for k, v in series.items():
            episode["equity"][k] = [_num(v[i]) for i in keep]
        if equity.get("unit_label"):
            episode["equity"]["unit_label"] = str(equity["unit_label"])
        if equity.get("caption"):
            episode["equity"]["caption"] = str(equity["caption"])

    pc = _pairs(per_coin, "symbol")
    if pc:
        episode["per_coin"] = sorted(pc, key=lambda x: x["pnl"], reverse=True)
    by = _pairs(by_year, "label")
    if by:
        episode["by_year"] = by
    if rules:
        episode["rules"] = {str(k): str(v) for k, v in rules.items()}
    if limitations:
        episode["limitations"] = [str(x) for x in limitations]

    ep_path = os.path.join(data_dir, ep_file)
    _write_json(ep_path, episode)

    # Update (or add) the board entry.
    new_entry = {
        "ep": int(ep),
        "claim": claim,
        "verdict": verdict,
        "summary": summary,
        "data": f"data/{ep_file}",
    }
    if card_stats:
        new_entry["stats"] = {str(k): str(v) for k, v in card_stats.items()}
    if net_pct is not None:
        new_entry["net_pct"] = _num(net_pct)
    if video:
        new_entry["video"] = video
    if code:
        new_entry["code"] = code
    if rules:
        new_entry["rules"] = episode["rules"]

    tests = [t for t in index.get("tests", []) if int(t.get("ep", -1)) != int(ep)]
    tests.append(new_entry)
    index["tests"] = sorted(tests, key=lambda t: int(t["ep"]))
    index["updated"] = date.today().isoformat()
    _write_json(index_path, index)
    return ep_path


if __name__ == "__main__":
    print(__doc__)
