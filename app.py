import os
import time
import math
import logging
from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
import yfinance as yf

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)  # Enable CORS for development flexibility

# Top 10 Nasdaq Stocks by market cap with names mapped
NASDAQ_TOP_10 = {
    'AAPL': 'Apple Inc.',
    'MSFT': 'Microsoft Corporation',
    'NVDA': 'NVIDIA Corporation',
    'AMZN': 'Amazon.com, Inc.',
    'META': 'Meta Platforms, Inc.',
    'GOOGL': 'Alphabet Inc.',
    'AVGO': 'Broadcom Inc.',
    'TSLA': 'Tesla, Inc.',
    'COST': 'Costco Wholesale Corporation',
    'NFLX': 'Netflix, Inc.'
}

# Cache structure
cache = {
    'data': None,
    'last_updated': 0,
    'expiry': 60  # Cache duration in seconds (1 minute)
}


def _as_float(value):
    """Convert a value to float if possible and finite."""
    if value is None:
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(value):
        return None
    return value


def fetch_stock_data():
    """Fetches key parameters for top 10 Nasdaq stocks using yfinance."""
    symbols = list(NASDAQ_TOP_10.keys())
    tickers = yf.Tickers(' '.join(symbols))

    results = []

    for symbol in symbols:
        ticker = tickers.tickers[symbol]
        try:
            fast_info = ticker.fast_info or {}
            info = ticker.info or {}

            last_price = _as_float(fast_info.get('last_price'))
            previous_close = _as_float(fast_info.get('previous_close'))

            if last_price is None or previous_close is None:
                hist = ticker.history(period='5d', auto_adjust=True)
                if not hist.empty:
                    if last_price is None:
                        last_price = _as_float(hist['Close'].iloc[-1])
                    if previous_close is None and len(hist) > 1:
                        previous_close = _as_float(hist['Close'].iloc[-2])

            if last_price is None:
                last_price = _as_float(info.get('regularMarketPrice') or info.get('previousClose'))

            if previous_close is None:
                previous_close = _as_float(info.get('previousClose'))

            if last_price is not None and previous_close not in (None, 0):
                price_change = float(last_price) - float(previous_close)
                percent_change = (price_change / float(previous_close)) * 100
            else:
                price_change = 0.0
                percent_change = 0.0

            results.append({
                'symbol': symbol,
                'name': NASDAQ_TOP_10[symbol],
                'price': round(float(last_price), 2) if last_price is not None else 0.0,
                'priceChange': round(float(price_change), 2),
                'percentChange': round(float(percent_change), 2),
                'previousClose': round(float(previous_close), 2) if previous_close is not None else 0.0,
                'marketCap': int((fast_info.get('market_cap') or info.get('marketCap') or 0) or 0),
                'volume': int((fast_info.get('last_volume') or info.get('volume') or 0) or 0),
                'dayHigh': round(float((fast_info.get('day_high') or info.get('dayHigh') or 0) or 0), 2),
                'dayLow': round(float((fast_info.get('day_low') or info.get('dayLow') or 0) or 0), 2),
            })

        except Exception as e:
            logging.error(f"Error fetching data for {symbol}: {str(e)}")
            results.append({
                'symbol': symbol,
                'name': NASDAQ_TOP_10[symbol],
                'price': 0.0,
                'priceChange': 0.0,
                'percentChange': 0.0,
                'previousClose': 0.0,
                'marketCap': 0,
                'volume': 0,
                'dayHigh': 0.0,
                'dayLow': 0.0,
                'error': True
            })

    return results

@app.route('/')
def serve_index():
    """Serves the index.html from static directory."""
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/stocks')
def get_stocks():
    """API endpoint to get real-time Nasdaq top 10 stocks data (cached)."""
    force = request.args.get('force', 'false').lower() == 'true'
    current_time = time.time()
    
    # Check if cache is still valid
    if not force and cache['data'] and (current_time - cache['last_updated'] < cache['expiry']):
        logging.info("Returning cached stock data")
        return jsonify({
            'stocks': cache['data'],
            'cached': True,
            'lastUpdated': int(cache['last_updated'])
        })
        
    logging.info("Cache expired or empty. Fetching fresh stock data...")
    try:
        fresh_data = fetch_stock_data()
        valid_prices = [s for s in fresh_data if s.get('price', 0) > 0]

        if valid_prices:
            cache['data'] = fresh_data
            cache['last_updated'] = current_time
            return jsonify({
                'stocks': fresh_data,
                'cached': False,
                'lastUpdated': int(cache['last_updated'])
            })

        if cache['data']:
            logging.warning("Live market data unavailable; returning cached values")
            return jsonify({
                'stocks': cache['data'],
                'cached': True,
                'warning': "Live market data unavailable; showing cached values",
                'lastUpdated': int(cache['last_updated'])
            })

        return jsonify({
            'stocks': fresh_data,
            'cached': False,
            'warning': "Live market data unavailable right now",
            'lastUpdated': 0
        })
    except Exception as e:
        logging.error(f"Failed to fetch stock data: {str(e)}")
        if cache['data']:
            logging.info("Returning stale cache due to fetch failure")
            return jsonify({
                'stocks': cache['data'],
                'cached': True,
                'warning': "Fetch failed; showing cached data",
                'lastUpdated': int(cache['last_updated'])
            }), 200
        return jsonify({
            'stocks': [],
            'cached': False,
            'warning': "Live market data unavailable and no cache is available",
            'lastUpdated': 0
        }), 200

@app.route('/api/stocks/<symbol>/history')
def get_stock_history(symbol):
    """Fetches 5-day historical data with 1-hour interval for a specific stock."""
    symbol = symbol.upper()
    if symbol not in NASDAQ_TOP_10:
        return jsonify({'error': 'Invalid stock symbol'}), 400
        
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period='5d', interval='1h')
        
        if df.empty:
            # Fallback if 1h interval fails, try 1d
            df = ticker.history(period='5d', interval='1d')
            
        history_list = []
        for index, row in df.iterrows():
            history_list.append({
                'timestamp': index.strftime('%Y-%m-%d %H:%M'),
                'label': index.strftime('%b %d, %I:%M %p'),
                'price': round(float(row['Close']), 2)
            })
            
        return jsonify({
            'symbol': symbol,
            'history': history_list
        })
    except Exception as e:
        logging.error(f"Error fetching history for {symbol}: {str(e)}")
        return jsonify({'error': f"Failed to fetch history for {symbol}"}), 500

if __name__ == '__main__':
    # Get port from environment or default to 5001 to avoid default mac airplay port clashes
    port = int(os.environ.get('PORT', 5001))
    app.run(host='127.0.0.1', port=port, debug=True)
