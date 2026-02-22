// market.js - Shared UI Logic for RigRadar
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
                    x: { display: false }, // We hide X axis on chat.html, but can enable it on index
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
            
            // Safe checks for index.html elements
            const scoreVal = document.getElementById('modal-score-val');
            if (scoreVal) scoreVal.innerText = (deal.score || 50) + '%';
            const scoreBar = document.getElementById('modal-score-bar');
            if (scoreBar) scoreBar.style.width = (deal.score || 50) + '%';
            
            const link = document.getElementById('modal-link');
            const productUrl = deal.url || deal.link || "#";
            if (productUrl !== "#") { link.href = productUrl; link.classList.remove('hidden'); } 
            else { link.classList.add('hidden'); }
            
            modal.classList.remove('hidden');
            setTimeout(() => { 
                modal.classList.remove('opacity-0'); 
                if(modalContent) { modalContent.classList.remove('scale-95'); modalContent.classList.add('scale-100'); }
            }, 10);
        } catch (e) { console.error("Error opening detail:", e); }
    },

    closeModal() {
        const modal = document.getElementById('detail-modal');
        const modalContent = modal.querySelector('div');
        modal.classList.add('opacity-0');
        if(modalContent) { modalContent.classList.remove('scale-100'); modalContent.classList.add('scale-95'); }
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
};
