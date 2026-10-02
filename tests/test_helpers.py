import math
import unittest
from app import _as_float


class TestAsFloatHelper(unittest.TestCase):
    """Unit tests for the _as_float numerical conversion and validation helper."""

    def test_valid_integers_and_floats(self):
        self.assertEqual(_as_float(0), 0.0)
        self.assertEqual(_as_float(123), 123.0)
        self.assertEqual(_as_float(45.67), 45.67)
        self.assertEqual(_as_float(-12.5), -12.5)

    def test_valid_numeric_strings(self):
        self.assertEqual(_as_float("123.45"), 123.45)
        self.assertEqual(_as_float("-99.9"), -99.9)
        self.assertEqual(_as_float("0"), 0.0)

    def test_none_returns_none(self):
        self.assertIsNone(_as_float(None))

    def test_infinite_values_return_none(self):
        self.assertIsNone(_as_float(float("inf")))
        self.assertIsNone(_as_float(float("-inf")))
        self.assertIsNone(_as_float("inf"))
        self.assertIsNone(_as_float("-inf"))

    def test_nan_values_return_none(self):
        self.assertIsNone(_as_float(float("nan")))
        self.assertIsNone(_as_float(math.nan))
        self.assertIsNone(_as_float("nan"))

    def test_invalid_strings_and_structures_return_none(self):
        self.assertIsNone(_as_float("abc"))
        self.assertIsNone(_as_float(""))
        self.assertIsNone(_as_float([]))
        self.assertIsNone(_as_float({}))


if __name__ == "__main__":
    unittest.main()
