window.MarketUI = {
    priceChartInstance: null,

    initChart(canvasId) {
        const el = document.getElementById(canvasId);
        if (!el) return;
        const ctx = el.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)'); 
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

        this.priceChartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Price', data: [], borderColor: '#3b82f6', backgroundColor: gradient, fill: true, tension: 0.3 }] },
            options: { 
                responsive: true, maintainAspectRatio: false, 
                plugins: { legend: { display: false } }, 
                scales: { 
                    x: { display: false },
                    y: { ticks: { color: '#666' }, grid: { color: 'rgba(255,255,255,0.05)' } } 
                } 
            }
        });
    },

    updateChart(chartPrices, chartLabels, chartTitle) {
        if (!this.priceChartInstance) return;
        
        const titleEl = document.getElementById('chart-title');
        if (titleEl && chartTitle) titleEl.innerText = chartTitle;

        const ctx = this.priceChartInstance.canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);

        let lineColor = '#3b82f6';
        if (chartPrices.length > 1) {
            const firstPrice = chartPrices[0];
            const lastPrice = chartPrices[chartPrices.length - 1];

            if (lastPrice < firstPrice) {
                lineColor = '#10b981'; 
                gradient.addColorStop(0, 'rgba(16, 185, 129, 0.5)');
                gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
            } else if (lastPrice > firstPrice) {
                lineColor = '#ef4444';
                gradient.addColorStop(0, 'rgba(239, 68, 68, 0.5)');
                gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
            } else {
                gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)'); 
                gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
            }
        } else {
            gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)'); 
            gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
        }

        this.priceChartInstance.data.datasets[0].borderColor = lineColor;
        this.priceChartInstance.data.datasets[0].backgroundColor = gradient;
        this.priceChartInstance.data.datasets[0].data = chartPrices;
        this.priceChartInstance.data.labels = chartLabels;
        this.priceChartInstance.update();
    },

    openDetail(dealDataEscaped) {
        try {
            const deal = JSON.parse(decodeURIComponent(dealDataEscaped));
            const modal = document.getElementById('detail-modal');
            const modalContent = modal.querySelector('div');
            
            const shareBtn = document.getElementById('modal-share');
            if (shareBtn) shareBtn.setAttribute('data-id', deal.id || '');

            document.getElementById('modal-title').innerText = deal.title || "Detail";
            document.getElementById('modal-price').innerText = deal.price || "---";
            document.getElementById('modal-opinion').innerText = deal.opinion || "No analysis.";
            document.getElementById('modal-badge').innerText = (deal.store || "WEB").toUpperCase();

            const imgEl = document.getElementById('modal-img');
            if (imgEl) {
                imgEl.src = deal.image || 'logo.png'; 
            }

            const forecast = deal.forecast ? deal.forecast.toUpperCase() : "WAIT";
            const forecastEl = document.getElementById('modal-forecast');
            if (forecastEl) {
                if (forecast.includes('BUY')) {
                    forecastEl.innerHTML = `<span class="bg-green-500/20 text-green-400 border border-green-500/50 px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.3)]">🔥 BUY NOW</span>`;
                } else if (forecast.includes('OVERPRICED') || forecast.includes('SELL')) {
                    forecastEl.innerHTML = `<span class="bg-red-500/20 text-red-400 border border-red-500/50 px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest">🛑 OVERPRICED</span>`;
                } else {
                    forecastEl.innerHTML = `<span class="bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest">⏳ WAIT / HOLD</span>`;
                }
            }

            const scoreVal = document.getElementById('modal-score-val');
            if (scoreVal) scoreVal.innerText = (deal.score || 50) + '%';
            const scoreBar = document.getElementById('modal-score-bar');
            if (scoreBar) scoreBar.style.width = (deal.score || 50) + '%';
            
            const descEl = document.getElementById('modal-desc');
            if (descEl) {
                const rawText = deal.description || deal.opinion || "";
                const lines = rawText.split('\n').filter(line => line.trim() !== "");
                
                descEl.innerHTML = lines.map(line => {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
                        return `<div class="flex gap-2 items-start mb-2 ml-1 text-gray-300 text-xs">
                                    <span class="text-blue-500 font-bold">•</span>
                                    <span>${trimmed.replace(/^[-•]\s*/, '')}</span>
                                </div>`;
                    }
                    return `<p class="mb-4 text-gray-400 leading-relaxed text-xs">${trimmed}</p>`;
                }).join('');
            }
            
            const link = document.getElementById('modal-link');
            const productUrl = deal.url || deal.link || "#";
            if (productUrl !== "#") { 
                link.href = window.getAffiliateUrl ? window.getAffiliateUrl(productUrl, deal.store) : productUrl; 
                link.classList.remove('hidden'); 
            } else { 
                link.classList.add('hidden'); 
            }
            
            modal.classList.remove('hidden');
            setTimeout(() => { 
                modal.classList.remove('opacity-0'); 
                if(modalContent) { 
                    modalContent.classList.remove('scale-95'); 
                    modalContent.classList.add('scale-100'); 
                }
            }, 10);
        } catch (e) { console.error("Error opening detail:", e); }
    },

    closeModal() {
        const modal = document.getElementById('detail-modal');
        if(!modal) return;
        const modalContent = modal.querySelector('div');
        modal.classList.add('opacity-0');
        if(modalContent) { 
            modalContent.classList.remove('scale-100'); 
            modalContent.classList.add('scale-95'); 
        }
        setTimeout(() => modal.classList.add('hidden'), 300);
    },

    initRealtime(pusherKey) {
        if (!pusherKey || window.pusherInstance) return;

        if (typeof Pusher === 'undefined') {
            console.error("Pusher SDK missing!");
            return;
        }

        const pusher = new Pusher(pusherKey, { cluster: 'eu' });
        window.pusherInstance = pusher;

        const channel = pusher.subscribe('rigradar-channel');
        channel.bind('new-deal', (data) => {
            console.log("⚡ Real-time update received!", data);
            
            const currentUserEmail = localStorage.getItem('rr_user_email');
            
            if (data.ownerEmail && data.ownerEmail === currentUserEmail) {
                const title = data.title ? data.title.substring(0, 40) + '...' : 'New Deal Found!';
                this.showGlobalNotification(title, data.price, data.store, data.url);
            }

            const statusEl = document.getElementById('scanStatus');
            const container = document.getElementById('scanner-container');
            const scanBtn = document.getElementById('scan-btn');

            if (statusEl) {
                statusEl.innerText = `✅ Signal intercepted!`;
                statusEl.className = "text-center text-xs font-mono h-4 text-green-500";
                setTimeout(() => { statusEl.innerText = ""; }, 3000);
            }
            if (container) container.classList.remove('scanning');
            if (scanBtn) scanBtn.disabled = false;

            if (typeof window.fetchLatestDeal === 'function') {
                window.fetchLatestDeal();
            }
        });
    },

    showToast(message, type = 'error') {
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none';
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        
        let bgColors = 'bg-red-600/90 border-red-500 text-white';
        let icon = '⚠️';
        
        if (type === 'success') {
            bgColors = 'bg-green-600/90 border-green-500 text-white';
            icon = '✅';
        } else if (type === 'info') {
            bgColors = 'bg-blue-600/90 border-blue-500 text-white';
            icon = 'ℹ️';
        }

        toast.className = `transform translate-y-10 opacity-0 transition-all duration-300 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md text-sm font-bold ${bgColors}`;
        toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

        toastContainer.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-10', 'opacity-0');
        });

        setTimeout(() => {
            toast.classList.add('translate-y-10', 'opacity-0');
            setTimeout(() => toast.remove(), 300); 
        }, 3000);
    },

    showGlobalNotification(title, price, store, url) {
        const toast = document.createElement('div');
        toast.className = "fixed top-24 right-5 z-[5000] bg-[#0a0a0a] border border-blue-500/50 text-white px-5 py-4 rounded-2xl shadow-[0_0_30px_rgba(59,130,246,0.2)] transform translate-x-full transition-all duration-500 cursor-pointer hover:bg-[#111]";
        
        toast.innerHTML = `
            <div class="flex items-center gap-4 relative overflow-hidden">
                <div class="absolute -right-5 -top-5 w-20 h-20 bg-blue-600/10 rounded-full blur-xl"></div>
                
                <div class="bg-blue-600/20 border border-blue-500/30 p-3 rounded-xl text-blue-400 z-10">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
                <div class="flex-grow max-w-[220px] z-10">
                    <p class="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-0.5">Scan Complete</p>
                    <p class="text-sm font-bold text-white truncate">${title}</p>
                    <div class="flex justify-between items-center mt-1">
                        <p class="text-base font-black text-green-400">${price || "---"}</p>
                        <p class="text-[10px] text-gray-500 uppercase font-bold bg-white/5 px-2 py-0.5 rounded">${store || "WEB"}</p>
                    </div>
                </div>
            </div>
        `;

        toast.onclick = () => {
            if (url) window.open(url, '_blank');
            toast.remove();
        };

        document.body.appendChild(toast);
        
        requestAnimationFrame(() => {
            toast.classList.remove('translate-x-full');
        });
        
        setTimeout(() => {
            toast.classList.add('translate-x-full');
            setTimeout(() => toast.remove(), 500);
        }, 7000);
    }
};
window.getAffiliateUrl = function(originalUrl, storeName) {
    const url = String(originalUrl || "");
    const store = String(storeName || "").toLowerCase();

    if (store.includes('amazon')) {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}tag=TVUJ_AMAZON_TAG-20`;
    }
    
    if (store.includes('alza')) {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}idp=TVOJE_ALZA_ID`;
    }

    return url; 
};

window.globalHistoryData = [];

window.updateDashboardPanels = function(targetTitle) {
    if (!targetTitle || !window.globalHistoryData.length) return;
    
    const keywords = targetTitle.split(' ').slice(0, 4).join(' ').toLowerCase();
    const relevantDeals = window.globalHistoryData.filter(d => d.title && d.title.toLowerCase().includes(keywords));

    let chartPrices = [];
    let chartLabels = [];
    const graphDeals = [...relevantDeals].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    graphDeals.forEach(d => {
        let listPrice = d.price || "0";
        if(listPrice.includes(":")) listPrice = listPrice.split(":")[1].trim();
        const p = parseFloat(listPrice.replace(/[^0-9.]/g, ''));
        if (!isNaN(p)) {
            chartPrices.push(p);
            const date = new Date(d.timestamp || Date.now());
            chartLabels.push(date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
        }
    });

    if (chartPrices.length === 1) {
        chartPrices.unshift(chartPrices[0]);
        chartLabels.unshift("Previous Scan");
    }

    if (chartPrices.length > 0 && window.MarketUI) {
        const chartTitle = targetTitle.split(' ').slice(0, 4).join(' ');
        MarketUI.updateChart(chartPrices, chartLabels, chartTitle);
    }

    const arbTitleEl = document.getElementById('arb-target-title');
    if (arbTitleEl) arbTitleEl.innerText = targetTitle.split(' ').slice(0, 4).join(' ');
    
    const storeMap = {};
    relevantDeals.forEach(item => {
        if (!storeMap[item.store] || item.timestamp > storeMap[item.store].timestamp) {
            storeMap[item.store] = item;
        }
    });

    let arbitrageData = Object.values(storeMap).sort((a, b) => {
        const pA = parseFloat(String(a.price).replace(/[^0-9.]/g, ''));
        const pB = parseFloat(String(b.price).replace(/[^0-9.]/g, ''));
        return pA - pB;
    }).slice(0, 3);

    const arbListEl = document.getElementById('arbitrage-list');
    const arbFooterEl = document.getElementById('arbitrage-footer');
    
    if (arbListEl) {
        if(arbitrageData.length === 0) {
            arbListEl.innerHTML = '<div class="text-center text-xs text-gray-500 py-4">No spread data found.</div>';
            if(arbFooterEl) arbFooterEl.innerHTML = "Waiting for more scans...";
        } else {
            let arbHtml = '';
            let cheapest = 0;
            let mostExpensive = 0;

            arbitrageData.forEach((storeData, i) => {
                let pStr = storeData.price || "---";
                if(String(pStr).includes(":")) pStr = pStr.split(":")[1].trim();
                const numPrice = parseFloat(String(pStr).replace(/[^0-9.]/g, ''));
                
                if (i === 0) cheapest = numPrice;
                if (numPrice > mostExpensive) mostExpensive = numPrice;

                const textColor = i === 0 ? "text-white" : "text-gray-500";
                const styleClasses = i === 0 ? "bg-[#111] border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]" : "bg-[#0a0a0a] border-white/5 opacity-60";
                let tag = i === 0 ? `<div class="absolute -top-2 left-3 bg-blue-600 text-white text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full shadow-lg">Best Deal</div>` : "";
                
                if (i === arbitrageData.length - 1 && arbitrageData.length > 1) {
                    tag = `<div class="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl backdrop-blur-[1px]"><span class="text-red-400 text-[9px] font-bold uppercase tracking-widest border border-red-500/30 bg-red-500/10 px-2 py-0.5 rounded">Overpriced</span></div>`;
                }

                arbHtml += `
                <div class="rounded-2xl p-4 flex items-center justify-between relative border ${styleClasses}">
                    ${tag}
                    <span class="text-xs ${i === 0 ? 'text-blue-300' : 'text-gray-500'} font-mono uppercase z-10">${storeData.store}</span>
                    <span class="text-xl font-black ${textColor} z-10">${pStr}</span>
                </div>`;
            });
            arbListEl.innerHTML = arbHtml;

            if (arbFooterEl) {
                if (mostExpensive > cheapest && cheapest > 0) {
                    const spread = Math.round(mostExpensive - cheapest);
                    arbFooterEl.innerHTML = `AI detected a <span class="text-white font-bold">$${spread} spread</span> on this item.`;
                } else {
                    arbFooterEl.innerHTML = "Market spread is tight. Excellent time to buy.";
                }
            }
        }
    }
};

window.filterHistory = function() {
    const input = document.getElementById('history-search');
    if (!input) return;
    const searchTerm = input.value.toLowerCase();
    const items = document.querySelectorAll('.history-item-card');
    let firstMatchTitle = null;

    items.forEach((item, index) => {
        const title = item.getAttribute('data-title').toLowerCase();
        const matches = title.includes(searchTerm);

        if (searchTerm.length > 0) {
            item.style.display = matches ? 'block' : 'none';
            item.style.opacity = "1";
            if (matches && !firstMatchTitle) firstMatchTitle = item.getAttribute('data-title');
        } else {
            item.style.display = index < 5 ? 'block' : 'none';
            item.style.opacity = index < 5 ? (1 - index * 0.15) : "1";
            if (index === 0) firstMatchTitle = item.getAttribute('data-title');
        }
    });

    if (firstMatchTitle && typeof updateDashboardPanels === 'function') {
        updateDashboardPanels(firstMatchTitle);
    }
};

window.fetchLatestDeal = async function() {
    if (document.hidden) return; 

    try {
        const res = await fetch(`/api/update_price`);
        const data = await res.json();
        
        const dot = document.getElementById('system-status-dot');
        const text = document.getElementById('system-status-text');
        if (dot && text && data.systemStatus) {
            const diff = (Date.now() - data.systemStatus.timestamp) / 1000;
            if (diff > 120) { 
                dot.className = "w-2.5 h-2.5 rounded-full bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]";
                text.innerText = "System Offline";
                text.className = "text-[10px] uppercase tracking-widest text-red-500 font-bold";
            } else {
                dot.className = "w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse";
                text.innerText = "System Online";
                text.className = "text-[10px] uppercase tracking-widest text-blue-400 font-bold";
            }
        }

        if (data.latest) {
            const priceEl = document.getElementById('top-catch-price');
            const opinionEl = document.getElementById('top-catch-opinion');
            const titleEl = document.getElementById('top-catch-title');
            const storeEl = document.getElementById('top-catch-store');
            const topCatchCard = document.getElementById('top-catch-card');

            let cleanPrice = data.latest.price || "---";
            if(cleanPrice.includes(":")) cleanPrice = cleanPrice.split(":")[1].trim();

            if(priceEl) priceEl.innerText = cleanPrice;
            if(opinionEl) opinionEl.innerText = `"${data.latest.opinion || "Best value found on the market."}"`;
            if(titleEl) titleEl.innerText = data.latest.title || "Latest Catch";
            if(storeEl) {
                storeEl.innerHTML = `<span class="mr-1 text-sm md:text-base leading-none">🔥</span> BEST DEAL IN <span class="text-white ml-1 font-black">${data.latest.store || "WEB"}</span>`;
                storeEl.className = "flex items-center text-[10px] md:text-xs font-bold uppercase tracking-widest bg-yellow-500/10 text-yellow-500 px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-yellow-500/30 shadow-[0_0_10px_rgba(234,179,8,0.2)] whitespace-nowrap";
            }   

            if (topCatchCard) {
                const dealDataEscaped = encodeURIComponent(JSON.stringify(data.latest)).replace(/'/g, "%27");
                topCatchCard.onclick = () => MarketUI.openDetail(dealDataEscaped);
            }
        }  
        
        const historyArray = data.history || [];
        window.globalHistoryData = historyArray; 
        const list = document.getElementById('history-list');
        const savedIds = (data.saved || []).map(s => String(s.id));

        if (historyArray.length > 0 && list) {
            let htmlContent = '';
            
            historyArray.forEach((deal, index) => {
                let timeText = "Now";
                if (deal.timestamp) {
                    const diffMs = Date.now() - deal.timestamp;
                    const minutes = Math.floor(diffMs / 60000);
                    timeText = minutes < 1 ? "< 1 min" : `${minutes} min`;
                }
                
                const score = deal.score || 50; 
                let scoreColor = score >= 80 ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : (score < 45 ? 'bg-red-600' : 'bg-blue-500');
                let listPrice = deal.price || "---";
                if(listPrice.includes(":")) listPrice = listPrice.split(":")[1].trim();
                
                const dealDataEscaped = encodeURIComponent(JSON.stringify(deal)).replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29"); 
                const isSaved = savedIds.includes(String(deal.id));
                
                let saveButtonHtml = isSaved 
                    ? `<button class="text-green-500 border border-green-500/50 bg-green-500/10 p-2 rounded-lg z-10 cursor-default"><span class="font-bold text-xs">✓</span></button>`
                    : `<button onclick="saveScanFromIndex(event, '${dealDataEscaped}', this)" class="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-all z-10"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path></svg></button>`;

                let badgeHtml = '';
                if (deal.bestDeal) {
                    badgeHtml = `<span class="bg-yellow-500 text-black text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow-[0_0_10px_rgba(234,179,8,0.5)] ml-2">🔥 Best Deal</span>`;
                } else if (deal.savingsPercent) {
                    badgeHtml = `<span class="bg-green-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest shadow-[0_0_10px_rgba(34,197,94,0.5)] ml-2">Save ${deal.savingsPercent}%</span>`;
                }

                const isHidden = index >= 5 ? 'style="display: none;"' : `style="opacity: ${1 - index * 0.15}"`;

                htmlContent += `
                    <div data-title="${deal.title.replace(/"/g, '&quot;')}" onclick="MarketUI.openDetail('${dealDataEscaped}')" class="history-item-card glass-panel p-4 md:p-5 rounded-xl transition-all border border-white/5 hover:border-blue-500/30 new-item cursor-pointer group relative" ${isHidden}>
                        <div class="flex justify-between items-start mb-2">
                            <div class="flex flex-col">
                                <div class="flex items-center gap-2">
                                    <span class="text-[10px] text-blue-400 font-bold uppercase tracking-widest">${deal.store || 'WEB'}</span>
                                    ${badgeHtml}
                                </div>
                                <h3 class="text-white font-bold text-xs md:text-sm leading-tight mt-1 group-hover:text-blue-400 transition-colors line-clamp-2 pr-8">${deal.title || 'Product'}</h3>
                            </div>
                            <div class="text-[9px] font-mono text-gray-600 pt-1 whitespace-nowrap">${timeText}</div>
                        </div>
                        <div class="flex justify-between items-end mt-3 md:mt-4">
                            <span class="text-xl md:text-2xl font-black text-white tracking-tighter">${listPrice}</span>
                            <div class="flex items-center gap-2">
                                ${saveButtonHtml}
                                <span class="hidden md:inline-block text-blue-500 text-xs font-bold uppercase tracking-widest bg-blue-500/10 px-2 py-2 rounded border border-blue-500/20 group-hover:bg-blue-500 group-hover:text-white transition-all">Detail ↗</span>
                            </div>
                        </div>
                        <div class="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-3">
                            <div class="h-full ${scoreColor} transition-all duration-1000" style="width: ${score}%"></div>
                        </div>
                    </div>`;
            });
            list.innerHTML = htmlContent;

            if (typeof updateDashboardPanels === 'function') {
                updateDashboardPanels(historyArray[0].title);
            }
        }

        const fCard = document.getElementById('frankenstein-card');
        if (data.frankenstein && fCard) {
            fCard.classList.remove('hidden');
            fCard.classList.add('flex');
            
            let partsHtml = '';
            if (data.frankenstein.parts && Array.isArray(data.frankenstein.parts)) {
                partsHtml = data.frankenstein.parts.map(p => `<li class="text-xs text-green-200/70 font-mono border-b border-green-500/10 py-2">${p}</li>`).join('');
            }
            
            fCard.innerHTML = `
                <div class="absolute inset-0 bg-gradient-to-r from-green-900/10 to-purple-900/10 opacity-50 pointer-events-none"></div>
                <div class="flex-1 relative z-10 space-y-4">
                    <h3 class="text-xs md:text-sm font-bold text-green-400 uppercase tracking-widest mb-2 flex items-center gap-3">
                        <span class="text-2xl animate-pulse">🧟‍♂️</span> Frankenstein Build of the Day
                    </h3>
                    <h4 class="text-3xl md:text-5xl font-black text-white leading-tight tracking-tight">${data.frankenstein.title || "Unknown Build"}</h4>
                    <div class="inline-block bg-green-500/20 text-green-400 border border-green-500/30 px-5 py-2 rounded-xl text-2xl font-black tracking-widest mt-2 mb-4 shadow-[0_0_15px_rgba(34,197,94,0.2)]">
                        ${data.frankenstein.total_price || "$---"}
                    </div>
                    <p class="text-green-100/80 text-sm leading-relaxed italic border-l-2 border-green-500/50 pl-4 bg-green-900/20 p-4 rounded-r-xl">"${data.frankenstein.commentary || "No commentary available."}"</p>
                </div>
                <div class="flex-1 relative z-10 bg-black/60 border border-green-500/20 rounded-2xl p-6 backdrop-blur-md shadow-2xl">
                    <h5 class="text-xs uppercase text-green-500 font-bold tracking-widest mb-4 border-b border-green-500/20 pb-3 flex items-center gap-2"><span>⚙️</span> Salvaged Parts</h5>
                    <ul class="space-y-1 mb-6">${partsHtml}</ul>
                    <button onclick="location.href='chat.html'" class="w-full bg-green-600/20 hover:bg-green-600/40 border border-green-500/50 text-green-400 font-bold py-3.5 rounded-xl transition-all text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                        <span>🛠️</span> Ask AI to modify build
                    </button>
                </div>
            `;
        } else if (fCard) {
            fCard.classList.add('hidden');
        }
        
        return data; 

    } catch (e) { 
        console.error("Fetch Error:", e); 
        return null;
    }
};

window.saveScanFromIndex = async function(event, dealDataEscaped, btn) {
    event.stopPropagation(); 

    const email = localStorage.getItem('rr_user_email');
    if (!email) { 
        alert("⚠️ Please log in to save scans!");
        return; 
    }

    const deal = JSON.parse(decodeURIComponent(dealDataEscaped));
    
    const originalContent = btn.innerHTML;
    btn.innerHTML = `✓`;
    btn.classList.add("text-green-500", "border-green-500/50");

    try {
        const res = await fetch('/api/scans?action=save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deal }) 
        });
        
        if(!res.ok) {
            btn.innerHTML = "❌";
            btn.classList.remove("text-green-500", "border-green-500/50");
            btn.classList.add("text-red-500");
            if (res.status === 401) alert("Session expired. Log in again.");
            
            setTimeout(() => {
                btn.innerHTML = originalContent;
                btn.classList.remove("text-red-500");
            }, 2000);
        } else {
            btn.onclick = null;
            btn.title = "Saved";
        }
    } catch (e) {
        console.error(e);
        btn.innerHTML = "❌";
        btn.classList.remove("text-green-500", "border-green-500/50");
        btn.classList.add("text-red-500");
        setTimeout(() => {
            btn.innerHTML = originalContent;
            btn.classList.remove("text-red-500");
        }, 2000);
    }
};

window.shareDeal = function() {
    const title = document.getElementById('modal-title').innerText;
    const price = document.getElementById('modal-price').innerText;
    const store = document.getElementById('modal-badge').innerText;
    const dealId = document.getElementById('modal-share').getAttribute('data-id');
    
    const shareUrl = dealId ? `https://rigradarai.com/api/share?id=${dealId}` : `https://rigradarai.com`;
    const shareText = `🔥 Crazy deal on RigRadar!\n\n${title}\n💰 ${price} at ${store}\n\nScanner: ${shareUrl}`;
    
    navigator.clipboard.writeText(shareText).then(() => {
        const shareBtn = document.getElementById('modal-share');
        const originalHtml = shareBtn.innerHTML;
        
        shareBtn.innerHTML = `<span class="text-green-400 font-bold text-sm">COPIED!</span>`;
        shareBtn.classList.add('border-green-500/50', 'bg-green-500/10');
        
        setTimeout(() => {
            shareBtn.innerHTML = originalHtml;
            shareBtn.classList.remove('border-green-500/50', 'bg-green-500/10');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
};
