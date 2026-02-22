// market.js - Shared UI Logic for RigRadar
window.MarketUI = {
    priceChartInstance: null,

    // 📊 Inicializace grafu
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

    // 📈 Aktualizace grafu novými daty
    updateChart(chartPrices, chartLabels, chartTitle) {
        if (!this.priceChartInstance) return;
        
        const titleEl = document.getElementById('chart-title');
        if (titleEl && chartTitle) titleEl.innerText = chartTitle;

        this.priceChartInstance.data.datasets[0].data = chartPrices;
        this.priceChartInstance.data.labels = chartLabels;
        this.priceChartInstance.update();
    },

    // 🔍 Otevření detailu produktu v modalu
    openDetail(dealDataEscaped) {
        try {
            const deal = JSON.parse(decodeURIComponent(dealDataEscaped));
            const modal = document.getElementById('detail-modal');
            const modalContent = modal.querySelector('div');
            
            document.getElementById('modal-title').innerText = deal.title || "Detail";
            document.getElementById('modal-price').innerText = deal.price || "---";
            document.getElementById('modal-opinion').innerText = deal.opinion || "No analysis.";
            document.getElementById('modal-badge').innerText = (deal.store || "WEB").toUpperCase();
            
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

    // ✖️ Zavření modalu
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

    // 📡 Pusher Real-time Inicializace (Klíč přichází z Vercelu)
    initRealtime(pusherKey) {
        if (!pusherKey || window.pusherInstance) return;

        // Pusher SDK musí být načteno v HTML přes <script>
        if (typeof Pusher === 'undefined') {
            console.error("Pusher SDK missing!");
            return;
        }

        const pusher = new Pusher(pusherKey, { cluster: 'eu' });
        window.pusherInstance = pusher;

        const channel = pusher.subscribe('rigradar-channel');
        channel.bind('new-deal', function(data) {
            console.log("⚡ Real-time update received!");
            
            // 1. Zastavení vizuálních indikátorů skenování
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

            // 2. Okamžitý refresh dat na stránce
            if (typeof fetchLatestDeal === 'function') {
                fetchLatestDeal();
            }
        });
    }
};
