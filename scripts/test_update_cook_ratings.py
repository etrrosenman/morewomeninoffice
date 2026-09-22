import importlib.util
import pathlib
import sys
import unittest


SCRIPT = pathlib.Path(__file__).with_name("update_cook_ratings.py")
SPEC = importlib.util.spec_from_file_location("update_cook_ratings", SCRIPT)
assert SPEC and SPEC.loader
module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = module
SPEC.loader.exec_module(module)


def page(seats, map_string, description="As of Sep. 17, 2026"):
    import json

    views = {
        "other": {"name": "Consensus Map", "map_string": "9" * len(map_string)},
        "cook": {
            "name": "Cook Political Report",
            "description": description,
            "map_string": map_string,
        },
    }
    return f"map_d3.seats = {json.dumps(seats)}; map_d3.views = {json.dumps(views)};"


class UpdateCookRatingsTests(unittest.TestCase):
    def test_house_at_large_and_map_codes(self):
        seats = {
            "ak": [{"state_abbr": "AK", "district_number": 1, "seat_status": "T", "map_code": "4"}],
            "ca": [{"state_abbr": "CA", "district_number": 2, "seat_status": "T", "map_code": "1"}],
        }
        ratings, date = module.ratings_from_html("house", page(seats, "05"), {"AK-AL", "CA-2"})
        self.assertEqual(ratings, {"AK-AL": "Toss-up", "CA-2": "Lean D"})
        self.assertEqual(date, "Sep. 17, 2026")

    def test_senate_ignores_not_up_seats_and_trailing_vp_position(self):
        seats = {
            "ak": {
                "1": {"state_abbr": "AK", "seat_number": 1, "seat_status": "N", "seat_rep_elected": 2028, "map_code": "9"},
                "2": {"state_abbr": "AK", "seat_number": 2, "seat_status": "T", "seat_rep_elected": 2026, "map_code": "0"},
            }
        }
        ratings, _ = module.ratings_from_html("senate", page(seats, "90" + "2"), {"AK"})
        self.assertEqual(ratings, {"AK": "Toss-up"})

    def test_rejects_incomplete_coverage(self):
        seats = [{"state_abbr": "WI", "seat_gov_elected": 2026, "seat_status": "T", "map_code": "0"}]
        with self.assertRaisesRegex(module.UpdateError, "missing MI"):
            module.ratings_from_html("governor", page(seats, "0"), {"MI", "WI"})


if __name__ == "__main__":
    unittest.main()
