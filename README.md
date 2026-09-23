# Nasdaq-10 Stock Price Dashboard

A real-time analytics web dashboard displaying performance metrics and 5-day charts for the top 10 US stocks traded on Nasdaq:
- **AAPL** (Apple Inc.)
- **MSFT** (Microsoft Corporation)
- **NVDA** (NVIDIA Corporation)
- **AMZN** (Amazon.com, Inc.)
- **META** (Meta Platforms, Inc.)
- **GOOGL** (Alphabet Inc.)
- **AVGO** (Broadcom Inc.)
- **TSLA** (Tesla, Inc.)
- **COST** (Costco Wholesale Corporation)
- **NFLX** (Netflix, Inc.)

Built using a **Python Flask backend** (retrieving real-time details from Yahoo Finance via `yfinance`) and a **modern HTML5/Vanilla CSS/JavaScript frontend** with a stunning dark Glassmorphic layout.

---

## Features

1. **Top Highlights Row**: Instantly displays the Volume Leader, Total Nasdaq-10 combined Market Cap, Top Gainer, and Top Loser.
2. **Interactive View Toggling**: Seamlessly switch between a grid of visual glass-cards or a detailed tabular list.
3. **Smart Cache System**: Implements a 60-second backend query cache preventing Yahoo Finance API rate-limiting or blocking.
4. **Auto-refresh**: Rotates a 1-minute countdown progress ring in the header, refreshing quotes automatically. Supports manual bypass refresh.
5. **Interactive Sparkline charts**: Clicking on any stock card/row opens a detailed modal drawer presenting a 5-day historical hourly price chart mapped using Chart.js.
6. **Dynamic Search & Filtering**: Fast client-side filtering matching search terms instantly against symbols or company names.
7. **Price Update Flashes**: Visual indicators (glowing green/red flashes) highlight when values rise or fall.

---

## Getting Started

### Prerequisites
- Python 3.3+ (Tested on Python 3.14)
- pip3

### Installation

1. Navigate to the project directory:
   ```bash
   cd /Users/katharineyau/.gemini/antigravity/scratch/nasdaq-stock-dashboard
   ```

2. Initialize a Python virtual environment and activate it:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. Install required packages:
   ```bash
   pip install -r requirements.txt
   ```

### Running the Dashboard

1. Start the Flask server:
   ```bash
   python app.py
   ```

2. Open your web browser and navigate to:
   ```
   http://127.0.0.1:5001
   ```

---

## Project Structure

- `app.py` - Flask backend providing the API endpoints and static file serving.
- `requirements.txt` - Python backend dependencies.
- `static/` - Frontend directory.
  - `index.html` - Semantic structure.
  - `style.css` - Custom styling tokens, layout grids, animations, and transitions.
  - `app.js` - Dynamic UI binding, polling timers, and Chart.js integrations.
