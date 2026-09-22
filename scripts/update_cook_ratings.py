#!/usr/bin/env python3
"""Refresh Cook Political Report race ratings from 270toWin's public mirrors.

Cook's pages reject automated requests. 270toWin publishes Cook-specific map
snapshots, including the source date and a rating for every race. This updater
reads those snapshots and changes only ``race_rating`` and ``rating_source``.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class OfficeConfig:
    filename: str
    url: str


SOURCES = {
    "house": OfficeConfig(
        "house.csv",
        "https://www.270towin.com/2026-house-election/cook-political-report-2026-house-ratings",
    ),
    "senate": OfficeConfig(
        "senate.csv",
        "https://www.270towin.com/2026-senate-election/cook-political-report-2026-senate",
    ),
    "governor": OfficeConfig(
        "governor.csv",
        "https://www.270towin.com/2026-governor-election/cook-political-report-2026-governor",
    ),
}

MAP_CODE_TO_RATING = {
    "0": "Toss-up",
    "1": "Solid D",
    "2": "Solid R",
    "3": "Likely D",
    "4": "Likely R",
    "5": "Lean D",
    "6": "Lean R",
    "7": "Tilt D",
    "8": "Tilt R",
}


class UpdateError(RuntimeError):
    pass


def request_html(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "morewomeninthehouse-data-updater/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read().decode("utf-8")
    except (urllib.error.URLError, TimeoutError, UnicodeDecodeError) as error:
        raise UpdateError(f"Cook ratings request failed for {url}: {error}") from error


def embedded_json(html: str, variable: str) -> object:
    marker = f"{variable} = "
    start = html.find(marker)
    if start < 0:
        raise UpdateError(f"Ratings page is missing {variable}")
    try:
        value, _ = json.JSONDecoder().raw_decode(html[start + len(marker):])
        return value
    except json.JSONDecodeError as error:
        raise UpdateError(f"Ratings page contains invalid {variable} data") from error


def flatten_seats(value: object) -> list[dict]:
    seats: list[dict] = []

    def walk(item: object) -> None:
        if isinstance(item, dict):
            if {"state_abbr", "seat_status", "map_code"} <= item.keys():
                seats.append(item)
                return
            for child in item.values():
                walk(child)
        elif isinstance(item, list):
            for child in item:
                walk(child)

    walk(value)
    return seats


def cook_view(views: object) -> dict:
    if not isinstance(views, dict):
        raise UpdateError("Ratings page contains an invalid views object")
    matches = [view for view in views.values() if view.get("name") == "Cook Political Report"]
    if len(matches) != 1:
        raise UpdateError(f"Expected one Cook Political Report view, found {len(matches)}")
    return matches[0]


def source_date(view: dict) -> str:
    match = re.search(r"As of ([^<&]+)", str(view.get("description", "")))
    return match.group(1).strip() if match else "unknown date"


def ratings_from_html(office: str, html: str, expected_ids: set[str]) -> tuple[dict[str, str], str]:
    seats = flatten_seats(embedded_json(html, "map_d3.seats"))
    view = cook_view(embedded_json(html, "map_d3.views"))
    map_string = str(view.get("map_string", ""))
    if len(map_string) < len(seats):
        raise UpdateError(
            f"{office}: Cook map has {len(map_string)} positions for {len(seats)} seats"
        )

    ratings: dict[str, str] = {}
    for seat, code in zip(seats, map_string):
        if code == "9" or seat.get("seat_status") != "T":
            continue
        if office == "senate" and seat.get("seat_rep_elected") != 2026:
            continue
        if office == "governor" and seat.get("seat_gov_elected") != 2026:
            continue

        try:
            rating = MAP_CODE_TO_RATING[code]
            state = str(seat["state_abbr"])
        except (KeyError, TypeError) as error:
            raise UpdateError(f"{office}: unrecognized Cook map position {code!r}") from error

        if office == "house":
            race_id = f"{state}-{seat.get('district_number')}"
            at_large_id = f"{state}-AL"
            if race_id not in expected_ids and at_large_id in expected_ids:
                race_id = at_large_id
        else:
            race_id = state

        if race_id in ratings:
            raise UpdateError(f"{office}: duplicate rating for {race_id}")
        ratings[race_id] = rating

    missing = expected_ids - ratings.keys()
    extra = ratings.keys() - expected_ids
    if missing or extra:
        details = []
        if missing:
            details.append(f"missing {', '.join(sorted(missing))}")
        if extra:
            details.append(f"unexpected {', '.join(sorted(extra))}")
        raise UpdateError(f"{office}: rating coverage mismatch ({'; '.join(details)})")
    return ratings, source_date(view)


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames or []
        required = {"race_id", "race_rating", "rating_source"}
        if missing := required - set(fields):
            raise UpdateError(f"{path} is missing columns: {', '.join(sorted(missing))}")
        rows = list(reader)
    if not rows:
        raise UpdateError(f"{path} contains no races")
    ids = [row["race_id"] for row in rows]
    if len(ids) != len(set(ids)):
        raise UpdateError(f"{path} contains duplicate race IDs")
    return fields, rows


def write_csv(path: Path, fields: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path("public/data"))
    parser.add_argument("--html-dir", type=Path, help="Read cook-{office}.html files instead of downloading")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and report without writing CSVs")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    pending: dict[str, tuple[Path, list[str], list[dict[str, str]]]] = {}
    for office, config in SOURCES.items():
        path = args.data_dir / config.filename
        fields, rows = read_csv(path)
        pending[office] = path, fields, rows

    if args.html_dir:
        pages = {
            office: (args.html_dir / f"cook-{office}.html").read_text(encoding="utf-8")
            for office in SOURCES
        }
    else:
        with ThreadPoolExecutor(max_workers=len(SOURCES)) as executor:
            futures = {
                office: executor.submit(request_html, config.url)
                for office, config in SOURCES.items()
            }
            pages = {office: future.result() for office, future in futures.items()}

    total_changes = 0
    for office, config in SOURCES.items():
        path, fields, rows = pending[office]
        ratings, date = ratings_from_html(
            office,
            pages[office],
            {row["race_id"] for row in rows},
        )
        changes = []
        for row in rows:
            old_rating = row["race_rating"]
            new_rating = ratings[row["race_id"]]
            if old_rating != new_rating:
                changes.append(f"{row['race_id']}: {old_rating} -> {new_rating}")
            row["race_rating"] = new_rating
            row["rating_source"] = config.url
        total_changes += len(changes)
        print(f"{path.name}: {len(rows)} ratings verified as of {date}; {len(changes)} changed")
        for change in changes:
            print(f"  {change}")

    if not args.dry_run:
        for path, fields, rows in pending.values():
            write_csv(path, fields, rows)
    print(
        f"{total_changes} rating changes found. "
        + ("Dry run; no files written." if args.dry_run else "Cook ratings update complete.")
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (UpdateError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
