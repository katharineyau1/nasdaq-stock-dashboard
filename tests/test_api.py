import unittest
from unittest.mock import patch, MagicMock
import pandas as pd
from app import app, cache, NASDAQ_TOP_10


class TestDashboardAPI(unittest.TestCase):
    """Test suite for Flask routes, API contracts, caching, and error resilience."""

    def setUp(self):
        self.app = app
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

        # Reset cache before each test
        cache["data"] = None
        cache["last_updated"] = 0

    def test_constituents_count_and_keys(self):
        """Verify the active constituent list has exactly 10 equities and contains MU and AMD."""
        self.assertEqual(len(NASDAQ_TOP_10), 10)
        expected_symbols = {
            "AAPL", "MSFT", "NVDA", "AMZN", "META",
            "GOOGL", "AVGO", "TSLA", "MU", "AMD"
        }
        self.assertEqual(set(NASDAQ_TOP_10.keys()), expected_symbols)
        self.assertNotIn("COST", NASDAQ_TOP_10)
        self.assertNotIn("NFLX", NASDAQ_TOP_10)

    def test_serve_index(self):
        """Verify GET / returns HTTP 200 with HTML content."""
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"<!DOCTYPE html>", response.data)
        self.assertIn(b"NASDAQ", response.data)

    @patch("app.yf.Tickers")
    def test_get_stocks_contract(self, mock_tickers_cls):
        """Verify GET /api/stocks returns valid JSON schema and correct constituent data."""
        # Create mock tickers mapping
        mock_tickers_obj = MagicMock()
        mock_tickers_dict = {}

        for sym in NASDAQ_TOP_10:
            mock_ticker = MagicMock()
            mock_ticker.fast_info = {
                "last_price": 150.25,
                "previous_close": 148.00,
                "market_cap": 2500000000000,
                "last_volume": 45000000,
                "day_high": 152.00,
                "day_low": 147.50,
            }
            mock_ticker.info = {}
            mock_tickers_dict[sym] = mock_ticker

        mock_tickers_obj.tickers = mock_tickers_dict
        mock_tickers_cls.return_value = mock_tickers_obj

        response = self.client.get("/api/stocks")
        self.assertEqual(response.status_code, 200)

        data = response.get_json()
        self.assertIn("stocks", data)
        self.assertIn("cached", data)
        self.assertIn("lastUpdated", data)
        self.assertFalse(data["cached"])
        self.assertEqual(len(data["stocks"]), 10)

        # Validate schema of each stock item
        required_fields = {
            "symbol", "name", "price", "priceChange", "percentChange",
            "previousClose", "marketCap", "volume", "dayHigh", "dayLow"
        }
        for stock in data["stocks"]:
            for field in required_fields:
                self.assertIn(field, stock, f"Missing field {field} in stock item")
            self.assertIsInstance(stock["price"], float)
            self.assertIsInstance(stock["marketCap"], int)
            self.assertIsInstance(stock["volume"], int)

    @patch("app.yf.Tickers")
    def test_caching_and_force_refresh(self, mock_tickers_cls):
        """Verify 60s cache serves cached data and ?force=true forces live refresh."""
        mock_tickers_obj = MagicMock()
        mock_tickers_dict = {}
        for sym in NASDAQ_TOP_10:
            mock_ticker = MagicMock()
            mock_ticker.fast_info = {
                "last_price": 200.0,
                "previous_close": 195.0,
                "market_cap": 1000000000,
                "last_volume": 100000,
                "day_high": 205.0,
                "day_low": 190.0,
            }
            mock_ticker.info = {}
            mock_tickers_dict[sym] = mock_ticker
        mock_tickers_obj.tickers = mock_tickers_dict
        mock_tickers_cls.return_value = mock_tickers_obj

        # 1st call: Miss -> Fresh data
        res1 = self.client.get("/api/stocks")
        data1 = res1.get_json()
        self.assertFalse(data1["cached"])
        self.assertEqual(mock_tickers_cls.call_count, 1)

        # 2nd call: Hit -> Cached data (yf.Tickers not called again)
        res2 = self.client.get("/api/stocks")
        data2 = res2.get_json()
        self.assertTrue(data2["cached"])
        self.assertEqual(mock_tickers_cls.call_count, 1)

        # 3rd call with force=true: Miss -> Fresh data (yf.Tickers called again)
        res3 = self.client.get("/api/stocks?force=true")
        data3 = res3.get_json()
        self.assertFalse(data3["cached"])
        self.assertEqual(mock_tickers_cls.call_count, 2)

    @patch("app.fetch_stock_data")
    def test_stale_cache_fallback_on_failure(self, mock_fetch):
        """Verify API falls back to stale cache with warning when upstream fetch fails."""
        # Prime the cache with existing data
        cache["data"] = [{"symbol": "AAPL", "name": "Apple Inc.", "price": 220.0}]
        cache["last_updated"] = 1000.0

        # Simulate upstream failure
        mock_fetch.side_effect = RuntimeError("Upstream rate limited")

        response = self.client.get("/api/stocks?force=true")
        self.assertEqual(response.status_code, 200)

        data = response.get_json()
        self.assertTrue(data["cached"])
        self.assertIn("warning", data)
        self.assertEqual(data["stocks"][0]["symbol"], "AAPL")

    def test_get_history_invalid_symbol(self):
        """Verify invalid stock symbol returns HTTP 400 Bad Request."""
        res_invalid = self.client.get("/api/stocks/INVALID/history")
        self.assertEqual(res_invalid.status_code, 400)
        self.assertIn("error", res_invalid.get_json())

        # COST was removed, should now return 400
        res_cost = self.client.get("/api/stocks/COST/history")
        self.assertEqual(res_cost.status_code, 400)

    @patch("app.yf.Ticker")
    def test_get_history_valid_symbol(self, mock_ticker_cls):
        """Verify valid symbol history returns formatted hourly timestamps and prices."""
        # Construct synthetic hourly DataFrame
        index = pd.date_range("2026-09-28 09:30:00", periods=5, freq="h", tz="America/New_York")
        df = pd.DataFrame({"Close": [220.5, 221.0, 222.5, 221.8, 223.4]}, index=index)

        mock_ticker = MagicMock()
        mock_ticker.history.return_value = df
        mock_ticker_cls.return_value = mock_ticker

        response = self.client.get("/api/stocks/nvda/history")  # Test case-insensitivity
        self.assertEqual(response.status_code, 200)

        data = response.get_json()
        self.assertEqual(data["symbol"], "NVDA")
        self.assertEqual(len(data["history"]), 5)

        first_point = data["history"][0]
        self.assertIn("timestamp", first_point)
        self.assertIn("label", first_point)
        self.assertEqual(first_point["price"], 220.5)

    @patch("app.yf.Ticker")
    def test_get_history_empty_data_returns_503(self, mock_ticker_cls):
        """Verify empty DataFrame from upstream returns HTTP 503 Service Unavailable."""
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = pd.DataFrame()
        mock_ticker_cls.return_value = mock_ticker

        response = self.client.get("/api/stocks/AAPL/history")
        self.assertEqual(response.status_code, 503)
        data = response.get_json()
        self.assertIn("error", data)
        self.assertEqual(data["history"], [])


if __name__ == "__main__":
    unittest.main()
