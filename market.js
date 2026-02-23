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

        this.priceChartInstance.data.datasets[0].data = chartPrices;
        this.priceChartInstance.data.labels = chartLabels;
        this.priceChartInstance.update();
    },

    openDetail(dealDataEscaped) {
        try {
            const deal = JSON.parse(decodeURIComponent(dealDataEscaped));
            const modal = document.getElementById('detail-modal');
            const modalContent = modal.querySelector('div');
            
            document.getElementById('modal-title').innerText = deal.title || "Detail";
            document.getElementById('modal-price').innerText = deal.price || "---";
            document.getElementById('modal-opinion').innerText = deal.opinion || "No analysis.";
            document.getElementById('modal-badge').innerText = (deal.store || "WEB").toUpperCase();

            const imgEl = document.getElementById('modal-img');
            if (imgEl) {
                imgEl.src = deal.image || 'logo.png'; 
            }

            const descEl = document.getElementById('modal-desc');
            if (descEl) {
                descEl.innerText = deal.description || deal.opinion; 
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
            
            const link = document.getElementById('modal-link');
            const productUrl = deal.url || deal.link || "#";
            if (productUrl !== "#") { 
                link.href = productUrl; 
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
            
            // 🔔 Vyvolání globální notifikace pouze pro majitele scanu
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

            if (typeof fetchLatestDeal === 'function') {
                fetchLatestDeal();
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

    // --- GLOBÁLNÍ NOTIFIKACE (Nyní jako správná metoda objektu) ---
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
