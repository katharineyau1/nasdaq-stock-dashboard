// GLOBAL APPLICATION STATE
let stocksData = [];
let viewMode = 'grid'; // 'grid' or 'list'
let searchQuery = '';
let refreshTimer = 60;
let timerInterval = null;
let chartInstance = null;

// DOM ELEMENTS
const stocksContainer = document.getElementById('stocks-container');
const loadingOverlay = document.getElementById('loading-overlay');
const errorBanner = document.getElementById('error-banner');
const errorMessage = document.getElementById('error-message');
const lastUpdatedTime = document.getElementById('last-updated-time');
const countdownText = document.getElementById('countdown-text');
const timerProgress = document.getElementById('timer-progress');
const manualRefreshBtn = document.getElementById('manual-refresh-btn');
const stockSearch = document.getElementById('stock-search');
const clearSearchBtn = document.getElementById('clear-search-btn');
const gridViewBtn = document.getElementById('grid-view-btn');
const listViewBtn = document.getElementById('list-view-btn');
const marketStatus = document.getElementById('market-status');

// SUMMARY WIDGETS
const summaryTotalCap = document.getElementById('summary-total-cap');
const summaryGainerVal = document.getElementById('summary-gainer-val');
const summaryGainerName = document.getElementById('summary-gainer-name');
const summaryLoserVal = document.getElementById('summary-loser-val');
const summaryLoserName = document.getElementById('summary-loser-name');
const summaryVolumeVal = document.getElementById('summary-volume-val');
const summaryVolumeName = document.getElementById('summary-volume-name');

// DETAILS MODAL ELEMENTS
const modal = document.getElementById('stock-details-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalSymbol = document.getElementById('modal-stock-symbol');
const modalName = document.getElementById('modal-stock-name');
const modalPrice = document.getElementById('modal-stock-price');
const modalChange = document.getElementById('modal-stock-change');
const statOpen = document.getElementById('stat-open');
const statPrevClose = document.getElementById('stat-prev-close');
const statRange = document.getElementById('stat-range');
const statVolume = document.getElementById('stat-volume');
const statMarketCap = document.getElementById('stat-market-cap');
const chartLoading = document.getElementById('chart-loading');
const chartError = document.getElementById('chart-error');

// FORMATTING HELPERS
function formatNumber(num) {
    if (num === undefined || num === null) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatMarketCap(cap) {
    if (!cap || cap === 0) return '—';
    if (cap >= 1e12) {
        return `$${(cap / 1e12).toFixed(2)}T`;
    } else if (cap >= 1e9) {
        return `$${(cap / 1e9).toFixed(2)}B`;
    }
    return `$${formatNumber(cap)}`;
}

function defVolume(vol) {
    if (!vol || vol === 0) return '—';
    if (vol >= 1e6) {
        return `${(vol / 1e6).toFixed(2)}M`;
    } else if (vol >= 1e3) {
        return `${(vol / 1e3).toFixed(1)}K`;
    }
    return vol.toString();
}

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    fetchStocks();
    startTimer();
});

// EVENT LISTENERS SETUP
function setupEventListeners() {
    // Manual Refresh
    manualRefreshBtn.addEventListener('click', () => {
        fetchStocks(true);
    });

    // Search Input
    stockSearch.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        if (searchQuery) {
            clearSearchBtn.classList.remove('hide');
        } else {
            clearSearchBtn.classList.add('hide');
        }
        renderStocks();
    });

    // Clear Search
    clearSearchBtn.addEventListener('click', () => {
        stockSearch.value = '';
        searchQuery = '';
        clearSearchBtn.classList.add('hide');
        renderStocks();
    });

    // View Switching
    gridViewBtn.addEventListener('click', () => {
        setViewMode('grid');
    });
    listViewBtn.addEventListener('click', () => {
        setViewMode('list');
    });

    // Modal Close
    closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    // Close modal on ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hide')) {
            closeModal();
        }
    });
}

// CONTROL TIMER
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    refreshTimer = 60;
    updateTimerUI();
    
    timerInterval = setInterval(() => {
        refreshTimer--;
        if (refreshTimer < 0) {
            refreshTimer = 60;
            fetchStocks();
        }
        updateTimerUI();
    }, 1000);
}

function updateTimerUI() {
    countdownText.textContent = refreshTimer;
    
    // Calculate circular stroke dash offset (svg circle total circumference is ~100)
    const progress = (refreshTimer / 60) * 100;
    timerProgress.style.strokeDasharray = `${progress}, 100`;
}

// VIEW SWITCHER MODE
function setViewMode(mode) {
    if (viewMode === mode) return;
    viewMode = mode;
    
    if (mode === 'grid') {
        gridViewBtn.classList.add('active');
        listViewBtn.classList.remove('active');
        stocksContainer.className = 'stocks-grid-view';
    } else {
        listViewBtn.classList.add('active');
        gridViewBtn.classList.remove('active');
        stocksContainer.className = 'stocks-list-view';
    }
    
    renderStocks();
}

// FETCH STOCK DATA FROM BACKEND
async function fetchStocks(force = false) {
    // Spin the refresh button
    manualRefreshBtn.classList.add('spin');
    
    if (stocksData.length === 0) {
        loadingOverlay.style.display = 'flex';
        stocksContainer.style.display = 'none';
    }

    try {
        const url = force ? '/api/stocks?force=true' : '/api/stocks';
        const response = await fetch(url);
        
        if (!response.ok) throw new Error('API fetch failed');
        
        const data = await response.json();
        
        // Preserve old prices to perform price change flashes
        const oldPrices = {};
        stocksData.forEach(s => {
            oldPrices[s.symbol] = s.price;
        });

        stocksData = data.stocks;
        
        // Update Metadata
        const date = new Date(data.lastUpdated * 1000);
        lastUpdatedTime.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        // Determine Market Status (Nasdaq standard trading hours: 9:30 AM - 4:00 PM EST, Mon-Fri)
        // Since we get real-time info from yfinance, we can check a combination of logic or approximate.
        // We'll update the market status pill based on yfinance values.
        checkMarketOpen();
        
        errorBanner.classList.add('hide');
        renderStocks(oldPrices);
        updateSummaryTiles();
        
        // Restart the timer since data was successfully fetched
        if (force) startTimer();
        
    } catch (err) {
        console.error('Fetch error:', err);
        errorBanner.classList.remove('hide');
        errorMessage.textContent = 'Failed to load live Nasdaq updates. Retrying in background...';
    } finally {
        manualRefreshBtn.classList.remove('spin');
        loadingOverlay.style.display = 'none';
        stocksContainer.style.display = viewMode === 'grid' ? 'grid' : 'flex';
    }
}

// DETECT MARKET OPEN/CLOSE INDICATOR
function checkMarketOpen() {
    // Standard EST is UTC-5 (or UTC-4 in daylight savings).
    // Let's compute if the current time is in trading hours: Mon-Fri 9:30 AM - 4:00 PM Eastern.
    const now = new Date();
    
    // Convert current time to Eastern Standard Time (EST/EDT)
    const estString = now.toLocaleString("en-US", { timeZone: "America/New_York" });
    const estDate = new Date(estString);
    
    const day = estDate.getDay(); // 0 = Sun, 6 = Sat
    const hour = estDate.getHours();
    const minute = estDate.getMinutes();
    
    const isWeekend = (day === 0 || day === 6);
    
    // Trading starts at 9:30 AM and ends at 4:00 PM EST
    const timeInMinutes = hour * 60 + minute;
    const marketOpenMinutes = 9 * 60 + 30; // 9:30 AM
    const marketCloseMinutes = 16 * 60;    // 4:00 PM
    
    const isTradingHours = (timeInMinutes >= marketOpenMinutes && timeInMinutes < marketCloseMinutes);
    
    const isMarketOpen = !isWeekend && isTradingHours;
    
    if (isMarketOpen) {
        marketStatus.className = 'market-status-pill open';
        marketStatus.querySelector('.status-text').textContent = 'Market Active';
    } else {
        marketStatus.className = 'market-status-pill closed';
        marketStatus.querySelector('.status-text').textContent = 'Market Closed';
    }
}

// UPDATE SUMMARY METRICS
function updateSummaryTiles() {
    if (stocksData.length === 0) return;

    // Calculate Total Market Cap
    const totalCap = stocksData.reduce((sum, s) => sum + s.marketCap, 0);
    summaryTotalCap.textContent = formatMarketCap(totalCap);

    // Calculate Top Gainer and Top Loser
    let topGainer = stocksData[0];
    let topLoser = stocksData[0];
    let volumeLeader = stocksData[0];

    stocksData.forEach(s => {
        if (s.percentChange > topGainer.percentChange) topGainer = s;
        if (s.percentChange < topLoser.percentChange) topLoser = s;
        if (s.volume > volumeLeader.volume) volumeLeader = s;
    });

    // Update Top Gainer
    summaryGainerVal.innerHTML = `<span class="gain">+${topGainer.percentChange.toFixed(2)}%</span>`;
    summaryGainerName.textContent = topGainer.symbol;
    summaryGainerName.className = 'tile-desc gaining';

    // Update Top Loser
    summaryLoserVal.innerHTML = `<span class="loss">${topLoser.percentChange.toFixed(2)}%</span>`;
    summaryLoserName.textContent = topLoser.symbol;
    summaryLoserName.className = 'tile-desc losing';

    // Update Volume Leader
    summaryVolumeVal.textContent = defVolume(volumeLeader.volume);
    summaryVolumeName.textContent = `${volumeLeader.symbol} Traded`;
}

// RENDER STOCKS TO CONTAINER
function renderStocks(oldPrices = {}) {
    // Filter stocks based on search query
    const filteredStocks = stocksData.filter(s => 
        s.symbol.toLowerCase().includes(searchQuery) || 
        s.name.toLowerCase().includes(searchQuery)
    );

    if (filteredStocks.length === 0) {
        stocksContainer.innerHTML = `
            <div class="glass-card" style="grid-column: 1/-1; padding: 3rem; text-align: center; color: var(--text-muted);">
                <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; margin-bottom: 1rem; display: block;"></i>
                No Nasdaq stocks found matching "${stockSearch.value}"
            </div>
        `;
        return;
    }

    if (viewMode === 'grid') {
        renderGridView(filteredStocks, oldPrices);
    } else {
        renderListView(filteredStocks, oldPrices);
    }
}

// RENDER GRID LAYOUT
function renderGridView(stocks, oldPrices) {
    stocksContainer.innerHTML = '';
    
    stocks.forEach(stock => {
        const isPositive = stock.priceChange >= 0;
        const trendClass = isPositive ? 'positive' : 'negative';
        const trendIcon = isPositive ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
        const sign = isPositive ? '+' : '';
        
        // Calculate daily range marker position
        let rangePercent = 50; // Default center
        if (stock.dayHigh !== stock.dayLow && stock.dayLow > 0) {
            rangePercent = ((stock.price - stock.dayLow) / (stock.dayHigh - stock.dayLow)) * 100;
            // Bound between 0 and 100
            rangePercent = Math.max(0, Math.min(100, rangePercent));
        }

        // Determine if price flashed
        let flashClass = '';
        if (oldPrices[stock.symbol] !== undefined) {
            if (stock.price > oldPrices[stock.symbol]) {
                flashClass = 'flash-price-up';
            } else if (stock.price < oldPrices[stock.symbol]) {
                flashClass = 'flash-price-down';
            }
        }
        
        const card = document.createElement('div');
        card.className = `stock-card glass-card ${trendClass}`;
        card.innerHTML = `
            <div class="card-header">
                <div class="stock-badge-group">
                    <span class="stock-sym">${stock.symbol}</span>
                    <span class="stock-name" title="${stock.name}">${stock.name}</span>
                </div>
                <span class="trend-pill">
                    <i class="fa-solid ${trendIcon}"></i> ${sign}${stock.percentChange.toFixed(2)}%
                </span>
            </div>
            
            <div class="price-display">
                <div id="price-${stock.symbol}" class="price-main ${flashClass}">$${stock.price.toFixed(2)}</div>
                <div class="price-change-sub">
                    <span>${sign}${stock.priceChange.toFixed(2)}</span>
                    <span style="opacity: 0.5;">•</span>
                    <span>Today</span>
                </div>
            </div>
            
            <div class="range-container">
                <div class="range-labels">
                    <span>L: $${stock.dayLow.toFixed(2)}</span>
                    <span>H: $${stock.dayHigh.toFixed(2)}</span>
                </div>
                <div class="range-bar">
                    <div class="range-fill" style="left: 0; width: 100%;"></div>
                    <div class="range-marker" style="left: ${rangePercent}%;"></div>
                </div>
            </div>
            
            <div class="card-stats-grid">
                <div class="card-stat">
                    <span class="stat-label">Market Cap</span>
                    <span class="stat-val">${formatMarketCap(stock.marketCap)}</span>
                </div>
                <div class="card-stat">
                    <span class="stat-label">Volume</span>
                    <span class="stat-val">${defVolume(stock.volume)}</span>
                </div>
            </div>
        `;
        
        // Remove flash classes after animation finishes so it can trigger again
        const priceEl = card.querySelector(`#price-${stock.symbol}`);
        priceEl.addEventListener('animationend', () => {
            priceEl.classList.remove('flash-price-up', 'flash-price-down');
        });

        card.addEventListener('click', () => openModal(stock.symbol));
        stocksContainer.appendChild(card);
    });
}

// RENDER LIST/TABLE LAYOUT
function renderListView(stocks, oldPrices) {
    stocksContainer.innerHTML = '';
    
    const table = document.createElement('div');
    table.className = 'stocks-list-view';
    
    // Table Header
    let tableHTML = `
        <div class="list-table-header">
            <div>Ticker</div>
            <div>Company</div>
            <div>Price</div>
            <div>Change</div>
            <div class="list-range">Daily Range</div>
            <div class="list-volume">Volume</div>
            <div class="list-cap">Market Cap</div>
        </div>
    `;
    
    // Table Rows
    stocks.forEach(stock => {
        const isPositive = stock.priceChange >= 0;
        const trendClass = isPositive ? 'positive' : 'negative';
        const sign = isPositive ? '+' : '';
        
        let rangePercent = 50;
        if (stock.dayHigh !== stock.dayLow && stock.dayLow > 0) {
            rangePercent = ((stock.price - stock.dayLow) / (stock.dayHigh - stock.dayLow)) * 100;
            rangePercent = Math.max(0, Math.min(100, rangePercent));
        }

        let flashClass = '';
        if (oldPrices[stock.symbol] !== undefined) {
            if (stock.price > oldPrices[stock.symbol]) {
                flashClass = 'flash-price-up';
            } else if (stock.price < oldPrices[stock.symbol]) {
                flashClass = 'flash-price-down';
            }
        }
        
        tableHTML += `
            <div class="list-row ${trendClass}" data-symbol="${stock.symbol}">
                <div class="list-symbol">${stock.symbol}</div>
                <div class="list-name" title="${stock.name}">${stock.name}</div>
                <div id="list-price-${stock.symbol}" class="list-price ${flashClass}">$${stock.price.toFixed(2)}</div>
                <div class="list-change">${sign}${stock.priceChange.toFixed(2)} (${sign}${stock.percentChange.toFixed(2)}%)</div>
                
                <div class="list-range range-container" style="margin-bottom: 0;">
                    <div class="range-labels" style="margin-bottom: 0.15rem;">
                        <span>$${stock.dayLow.toFixed(2)}</span>
                        <span>$${stock.dayHigh.toFixed(2)}</span>
                    </div>
                    <div class="range-bar">
                        <div class="range-fill" style="left: 0; width: 100%;"></div>
                        <div class="range-marker" style="left: ${rangePercent}%;"></div>
                    </div>
                </div>
                
                <div class="list-volume">${defVolume(stock.volume)}</div>
                <div class="list-cap">${formatMarketCap(stock.marketCap)}</div>
            </div>
        `;
    });
    
    table.innerHTML = tableHTML;
    
    // Add Event Listeners for rows
    table.querySelectorAll('.list-row').forEach(row => {
        const symbol = row.getAttribute('data-symbol');
        
        const priceEl = row.querySelector(`#list-price-${symbol}`);
        priceEl.addEventListener('animationend', () => {
            priceEl.classList.remove('flash-price-up', 'flash-price-down');
        });

        row.addEventListener('click', () => openModal(symbol));
    });
    
    stocksContainer.appendChild(table);
}

// OPEN DETAILS MODAL OVERLAY AND DRAW CHART
async function openModal(symbol) {
    const stock = stocksData.find(s => s.symbol === symbol);
    if (!stock) return;

    // Populate standard metrics
    modalSymbol.textContent = stock.symbol;
    modalName.textContent = stock.name;
    modalPrice.textContent = `$${stock.price.toFixed(2)}`;
    
    const isPositive = stock.priceChange >= 0;
    const sign = isPositive ? '+' : '';
    modalChange.textContent = `${sign}${stock.priceChange.toFixed(2)} (${sign}${stock.percentChange.toFixed(2)}%)`;
    modalChange.className = `modal-change ${isPositive ? 'positive' : 'negative'}`;
    
    statOpen.textContent = `$${stock.previousClose.toFixed(2)}`; // Open info is estimated or equal to prev close
    statPrevClose.textContent = `$${stock.previousClose.toFixed(2)}`;
    statRange.textContent = `$${stock.dayLow.toFixed(2)} - $${stock.dayHigh.toFixed(2)}`;
    statVolume.textContent = formatNumber(stock.volume);
    statMarketCap.textContent = formatMarketCap(stock.marketCap);

    // Show modal
    modal.classList.remove('hide');
    document.body.style.overflow = 'hidden'; // Lock background scrolling

    // Fetch and Draw Chart
    drawHistoryChart(symbol, isPositive);
}

function closeModal() {
    modal.classList.add('hide');
    document.body.style.overflow = 'auto'; // Unlock background scrolling
    
    // Destroy chart on close to avoid rendering ghost instances
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
}

// RENDER LINE CHART USING CHART.JS
async function drawHistoryChart(symbol, isPositive) {
    chartLoading.classList.remove('hide');
    chartError.classList.add('hide');
    
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    try {
        const response = await fetch(`/api/stocks/${symbol}/history`);
        if (!response.ok) throw new Error('History fetch failed');
        
        const data = await response.json();
        const history = data.history;
        
        if (history.length === 0) throw new Error('Empty historical data');
        
        const labels = history.map(h => h.label);
        const prices = history.map(h => h.price);

        const ctx = document.getElementById('historyChart').getContext('2d');
        
        // Define color theme based on stock trend (Gain vs Loss)
        const lineColor = isPositive ? 'rgb(16, 185, 129)' : 'rgb(244, 63, 94)';
        const glowColor = isPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)';
        
        // Setup canvas vertical gradient under the line
        const gradient = ctx.createLinearGradient(0, 0, 0, 220);
        gradient.addColorStop(0, glowColor);
        gradient.addColorStop(1, 'rgba(20, 24, 38, 0)');
        
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    data: prices,
                    borderColor: lineColor,
                    borderWidth: 2,
                    pointBackgroundColor: lineColor,
                    pointBorderColor: 'rgba(255, 255, 255, 0.8)',
                    pointBorderWidth: 1,
                    pointRadius: 0, // Hide points by default for clean sleek look
                    pointHoverRadius: 5, // Show points on hover
                    tension: 0.35, // Smooth curves
                    fill: true,
                    backgroundColor: gradient
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }, // Hide default legend
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleFont: { family: 'Outfit', size: 11 },
                        bodyFont: { family: 'Inter', size: 12 },
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return `Price: $${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.4)',
                            font: { size: 9, family: 'Inter' },
                            maxTicksLimit: 6 // Limit x ticks for clarity
                        },
                        border: { display: false }
                    },
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.04)',
                            drawTicks: false
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.4)',
                            font: { size: 9, family: 'Inter' },
                            callback: function(val) {
                                return '$' + val.toFixed(0);
                            }
                        },
                        border: { display: false }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });

    } catch (err) {
        console.error('Chart error:', err);
        chartError.classList.remove('hide');
    } finally {
        chartLoading.classList.add('hide');
    }
}
