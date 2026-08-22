#!/usr/bin/env python3
"""Refresh race probabilities from Kalshi's public market-data API.

The updater is deliberately conservative: a row changes only when it can find two
live Kalshi markets and derive a valid normalized probability pair. Unmatched rows
keep their existing values and are reported at the end.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


API_BASE = "https://external-api.kalshi.com/trade-api/v2"
DATA_FILES = ("house.csv", "governor.csv", "senate.csv")
PARTY_TICKER = re.compile(r"\b((?:KX)?(?:GOVPARTY|SENATE)[A-Z0-9-]+-(?:D|R))\b")
REQUIRED_FIELDS = {
    "snapshot_date", "office", "race_id", "dem_woman", "rep_woman",
    "dem_win_probability", "rep_win_probability", "expected_woman", "notes",
}


class UpdateError(RuntimeError):
    pass


@dataclass
class Result:
    file: str
    updated: int = 0
    unchanged: int = 0
    skipped: int = 0


def request_json(path: str, query: dict[str, str | int] | None = None) -> dict:
    url = f"{API_BASE}{path}"
    if query:
        url += "?" + urllib.parse.urlencode(query)
    request = urllib.request.Request(url, headers={"User-Agent": "morewomeninthehouse-data-updater/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise UpdateError(f"Kalshi request failed for {url}: {error}") from error


def midpoint(market: dict) -> float | None:
    """Return the YES bid/ask midpoint, with last price as a narrow fallback."""
    try:
        bid = float(market.get("yes_bid_dollars") or 0)
        ask = float(market.get("yes_ask_dollars") or 0)
        last = float(market.get("last_price_dollars") or 0)
    except (TypeError, ValueError):
        return None
    if bid > 0 and ask > 0 and bid <= ask:
        return (bid + ask) / 2
    if 0 < last < 1:
        return last
    return None


def normalized_pair(dem_market: dict, rep_market: dict) -> tuple[float, float] | None:
    dem_raw = midpoint(dem_market)
    rep_raw = midpoint(rep_market)
    if dem_raw is None or rep_raw is None or dem_raw + rep_raw <= 0:
        return None
    dem = dem_raw / (dem_raw + rep_raw)
    return dem, 1 - dem


def house_event_ticker(race_id: str) -> str:
    state, district = race_id.split("-", 1)
    district_code = "AL" if district == "AL" else district.zfill(2)
    return f"KXHOUSERACE-{state}{district_code}-26"


def is_standard_house_pair(row: dict[str, str]) -> bool:
    """Exclude rows whose two displayed sides are not ordinary D-vs-R choices."""
    return (
        row["race_id"] not in {"AK-AL", "CA-6"}
        and " / " not in row.get("dem_candidate", "")
        and " / " not in row.get("rep_candidate", "")
        and "independent" not in row.get("dem_gender_basis", "").lower()
        and "independent" not in row.get("rep_gender_basis", "").lower()
    )


def fetch_house_markets() -> dict[str, dict[str, dict]]:
    """Index Democratic and Republican markets by House event ticker."""
    indexed: dict[str, dict[str, dict]] = {}
    cursor = ""
    while True:
        query: dict[str, str | int] = {"series_ticker": "KXHOUSERACE", "limit": 1000}
        if cursor:
            query["cursor"] = cursor
        payload = request_json("/markets", query)
        for market in payload.get("markets", []):
            ticker = str(market.get("ticker", ""))
            party = ticker.rsplit("-", 1)[-1]
            if party in {"D", "R"}:
                indexed.setdefault(str(market.get("event_ticker", "")), {})[party] = market
        cursor = str(payload.get("cursor") or "")
        if not cursor:
            return indexed


def markets_from_notes(notes: str, cache: dict[str, dict]) -> tuple[dict, dict] | None:
    tickers = PARTY_TICKER.findall(notes)
    dem_ticker = next((ticker for ticker in tickers if ticker.endswith("-D")), None)
    rep_ticker = next((ticker for ticker in tickers if ticker.endswith("-R")), None)
    if not dem_ticker or not rep_ticker:
        return None
    if dem_ticker not in cache or rep_ticker not in cache:
        return None
    return cache[dem_ticker], cache[rep_ticker]


def fetch_direct_markets(rows_by_file: Iterable[list[dict[str, str]]]) -> dict[str, dict]:
    tickers = sorted({
        ticker
        for rows in rows_by_file
        for row in rows
        if row["office"] != "House"
        for ticker in PARTY_TICKER.findall(row["notes"])
    })
    cache: dict[str, dict] = {}

    def fetch(ticker: str) -> tuple[str, dict | None]:
        try:
            return ticker, request_json(f"/markets/{ticker}").get("market")
        except UpdateError:
            return ticker, None

    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = [executor.submit(fetch, ticker) for ticker in tickers]
        for future in as_completed(futures):
            ticker, market = future.result()
            if market:
                cache[ticker] = market
    return cache


def fmt(value: float) -> str:
    return f"{value:.6f}"


def update_rows(
    rows: list[dict[str, str]],
    house_markets: dict[str, dict[str, dict]],
    direct_cache: dict[str, dict],
    result: Result,
) -> None:
    today = datetime.now(timezone.utc).date().isoformat()
    for row in rows:
        markets: tuple[dict, dict] | None = None
        if row["office"] == "House" and is_standard_house_pair(row):
            event = house_markets.get(house_event_ticker(row["race_id"]), {})
            if "D" in event and "R" in event:
                markets = event["D"], event["R"]
        else:
            markets = markets_from_notes(row["notes"], direct_cache)

        pair = normalized_pair(*markets) if markets else None
        if pair is None:
            result.skipped += 1
            continue

        dem, rep = pair
        expected = float(row["dem_woman"]) * dem + float(row["rep_woman"]) * rep
        new_values = (fmt(dem), fmt(rep), fmt(expected))
        old_values = (row["dem_win_probability"], row["rep_win_probability"], row["expected_woman"])
        if new_values == old_values and row["snapshot_date"] == today:
            result.unchanged += 1
            continue
        row["snapshot_date"] = today
        row["dem_win_probability"], row["rep_win_probability"], row["expected_woman"] = new_values
        result.updated += 1


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames or []
        missing = REQUIRED_FIELDS - set(fields)
        if missing:
            raise UpdateError(f"{path} is missing columns: {', '.join(sorted(missing))}")
        rows = list(reader)
    if not rows:
        raise UpdateError(f"{path} contains no races")
    return fields, rows


def write_csv(path: Path, fields: list[str], rows: Iterable[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def validate(rows: list[dict[str, str]], path: Path) -> None:
    for index, row in enumerate(rows, 2):
        try:
            dem = float(row["dem_win_probability"])
            rep = float(row["rep_win_probability"])
            expected = float(row["expected_woman"])
        except ValueError as error:
            raise UpdateError(f"{path}:{index} contains an invalid number") from error
        if not (0 <= dem <= 1 and 0 <= rep <= 1 and 0 <= expected <= 1):
            raise UpdateError(f"{path}:{index} contains a probability outside [0, 1]")
        if abs(dem + rep - 1) > 0.000002:
            raise UpdateError(f"{path}:{index} D/R probabilities do not sum to 1")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path("public/data"))
    parser.add_argument("--dry-run", action="store_true", help="Fetch and report without writing CSVs")
    parser.add_argument("--max-skip-rate", type=float, default=0.20, help="Fail if more than this fraction of all rows is unmatched")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not 0 <= args.max_skip_rate <= 1:
        raise UpdateError("--max-skip-rate must be between 0 and 1")
    results: list[Result] = []
    pending: list[tuple[Path, list[str], list[dict[str, str]]]] = []

    for filename in DATA_FILES:
        path = args.data_dir / filename
        fields, rows = read_csv(path)
        pending.append((path, fields, rows))

    with ThreadPoolExecutor(max_workers=2) as executor:
        house_future = executor.submit(fetch_house_markets)
        direct_future = executor.submit(fetch_direct_markets, [item[2] for item in pending])
        house_markets = house_future.result()
        direct_cache = direct_future.result()

    for path, fields, rows in pending:
        result = Result(path.name)
        update_rows(rows, house_markets, direct_cache, result)
        validate(rows, path)
        results.append(result)

    total_rows = sum(item.updated + item.unchanged + item.skipped for item in results)
    total_skipped = sum(item.skipped for item in results)
    if total_skipped / total_rows > args.max_skip_rate:
        raise UpdateError(
            f"Skipped {total_skipped}/{total_rows} rows, exceeding the "
            f"{args.max_skip_rate:.0%} safety threshold; no files were written."
        )

    if not args.dry_run:
        for path, fields, rows in pending:
            write_csv(path, fields, rows)

    for result in results:
        print(f"{result.file}: {result.updated} updated, {result.unchanged} unchanged, {result.skipped} skipped")
    print("Dry run; no files written." if args.dry_run else "Kalshi snapshot update complete.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except UpdateError as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
