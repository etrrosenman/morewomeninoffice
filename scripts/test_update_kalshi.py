import importlib.util
import pathlib
import sys
import unittest


SCRIPT = pathlib.Path(__file__).with_name("update_kalshi.py")
SPEC = importlib.util.spec_from_file_location("update_kalshi", SCRIPT)
assert SPEC and SPEC.loader
module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = module
SPEC.loader.exec_module(module)


class UpdateKalshiTests(unittest.TestCase):
    def test_house_event_ticker(self):
        self.assertEqual(module.house_event_ticker("CA-4"), "KXHOUSERACE-CA04-26")
        self.assertEqual(module.house_event_ticker("AK-AL"), "KXHOUSERACE-AKAL-26")

    def test_midpoint_and_normalization(self):
        dem = {"yes_bid_dollars": "0.60", "yes_ask_dollars": "0.62"}
        rep = {"yes_bid_dollars": "0.39", "yes_ask_dollars": "0.41"}
        self.assertEqual(module.midpoint(dem), 0.61)
        pair = module.normalized_pair(dem, rep)
        self.assertIsNotNone(pair)
        self.assertAlmostEqual(sum(pair), 1)
        self.assertAlmostEqual(pair[0], 0.61 / 1.01)

    def test_notes_ticker_pattern(self):
        notes = "Kalshi GOVPARTYAL-26-D and GOVPARTYAL-26-R bid/ask midpoints."
        self.assertEqual(module.PARTY_TICKER.findall(notes), ["GOVPARTYAL-26-D", "GOVPARTYAL-26-R"])

    def test_nonstandard_house_pairs_are_skipped(self):
        ordinary = {"race_id": "CA-1", "dem_candidate": "A", "rep_candidate": "B", "dem_gender_basis": "", "rep_gender_basis": ""}
        combined = {**ordinary, "dem_candidate": "A / C"}
        independent = {**ordinary, "race_id": "AK-AL"}
        self.assertTrue(module.is_standard_house_pair(ordinary))
        self.assertFalse(module.is_standard_house_pair(combined))
        self.assertFalse(module.is_standard_house_pair(independent))


if __name__ == "__main__":
    unittest.main()
