import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const apiKey = req.headers['x-radar-api-key'];
    if (apiKey !== process.env.RADAR_API_SECRET) {
        return res.status(401).json({ error: 'Unauthorized radar node.' });
    }
    if (req.body.type === 'heartbeat') {
        await redis.set('system_status', { status: 'online', timestamp: Date.now() });
        return res.status(200).json({ status: 'Heartbeat registered' });
    }
    const { price, title, url, store, opinion, score, type, ownerEmail, forecast, image, description } = req.body;
    
    if (!price || !opinion) return res.status(400).json({ error: 'Missing data' });
    
    const newDeal = {
        price: String(price),
        title: title || "Unknown Product",
        url: url || "#",
        store: store || "WEB", 
        opinion,
        image: image || "",
        description: description || "", 
        score: score || 50,
        forecast: forecast || "WAIT",
        type: type || 'HW',
        ownerEmail: ownerEmail || 'system',
        timestamp: Date.now(),
        id: Date.now().toString() 
    };

    try {
        if (!ownerEmail || ownerEmail === 'system') {
            await redis.set('latest_deal', JSON.stringify(newDeal));
            await redis.lpush('deal_history', JSON.stringify(newDeal));
            await redis.ltrim('deal_history', 0, 19); 
            
            await redis.lpush('global_history', JSON.stringify(newDeal));
            await redis.ltrim('global_history', 0, 100);

        } else {
            const userHistoryKey = `user_history:${ownerEmail}`;
            await redis.lpush(userHistoryKey, JSON.stringify(newDeal));
            await redis.ltrim(userHistoryKey, 0, 9); 
            
            await redis.lpush('global_history', JSON.stringify(newDeal));
            await redis.ltrim('global_history', 0, 100);
        }
        return res.status(200).json({ status: 'Saved' });
    } catch (error) {
        console.error("Save Error:", error);
        return res.status(500).json({ error: 'Database save failed' });
    }
  }

  try {
    const cookieHeader = req.headers.cookie || '';
    const tokenMatch = cookieHeader.match(/rr_auth_token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    let userEmail = null;
    if (token) {
        try { userEmail = await redis.get(`session:${token}`); } catch (e) {}
    }

    const promises = [
        redis.get('latest_deal'),            
        redis.lrange('global_history', 0, 49),  
        redis.get('system_status'),
        redis.get('frankenstein_build') 
    ];
    
    if (userEmail) {
        promises.push(redis.lrange(`user_history:${userEmail}`, 0, 9)); 
        promises.push(redis.hvals(`saved_scans:${userEmail}`));
    }
    
    const results = await Promise.all(promises);
    
    const parseItems = (items) => (items || []).map(item => {
        try { 
            let parsed = (typeof item === 'string') ? JSON.parse(item) : item; 
            return typeof parsed === 'string' ? JSON.parse(parsed) : parsed; 
        } catch (e) { return null; }
    }).filter(item => item !== null && typeof item === 'object');
    
    const globalHistory = parseItems(results[1]);
    const userHistory = results[4] ? parseItems(results[4]) : [];
    const savedItems = results[5] ? parseItems(results[5]) : [];
    let frankenstein = results[3];
    if (typeof frankenstein === 'string') {
        try { frankenstein = JSON.parse(frankenstein); } catch(e) {}
    }
    
    const processedHistory = globalHistory.map(deal => {
        if (!deal.title) return deal;
        
        const keywords = deal.title.split(' ').slice(0, 4).join(' ').toLowerCase();
        const similarDeals = globalHistory.filter(d => d.title && d.title.toLowerCase().includes(keywords));
        
        let prices = similarDeals.map(d => {
            let pStr = d.price || "0";
            if(pStr.includes(":")) pStr = pStr.split(":")[1];
            return parseFloat(pStr.replace(/[^0-9.]/g, ''));
        }).filter(p => !isNaN(p) && p > 0);

        if (prices.length > 0) {
            const minPrice = Math.min(...prices);
            const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
            
            let pStr = deal.price || "0";
            if(pStr.includes(":")) pStr = pStr.split(":")[1];
            let currentPrice = parseFloat(pStr.replace(/[^0-9.]/g, ''));
            
            if (prices.length > 1) {
                if (currentPrice <= minPrice) deal.bestDeal = true;
                else if (currentPrice < avgPrice) {
                    const savings = Math.round(((avgPrice - currentPrice) / avgPrice) * 100);
                    if (savings > 0) deal.savingsPercent = savings;
                } else {
                    deal.isOverpriced = true; 
                }
            }
        }
        return deal;
    });

    const bestDealsList = processedHistory.filter(d => d.bestDeal);
    let safeLatest = bestDealsList.length > 0 ? bestDealsList[0] : (processedHistory[0] || null);

    if (!safeLatest) {
        safeLatest = results[0] || { price: "---", opinion: "No data", score: 50 };
        if (typeof safeLatest === 'string') {
            try { safeLatest = JSON.parse(safeLatest); } catch(e) {}
        }
    }

    let arbitrageData = [];
    let arbitrageTarget = "";
    
    if (safeLatest && safeLatest.title && safeLatest.title !== "Unknown Product") {
        arbitrageTarget = safeLatest.title.split(' ').slice(0, 4).join(' ');
        const keywords = safeLatest.title.split(' ').slice(0, 4).join(' ').toLowerCase();
        const similarDeals = processedHistory.filter(d => d.title && d.title.toLowerCase().includes(keywords));
        
        const storeMap = {};
        similarDeals.forEach(item => {
            if (!storeMap[item.store] || item.timestamp > storeMap[item.store].timestamp) {
                storeMap[item.store] = item; 
            }
        });
        
        arbitrageData = Object.values(storeMap).sort((a, b) => {
            const pA = parseFloat(String(a.price).replace(/[^0-9.]/g, ''));
            const pB = parseFloat(String(b.price).replace(/[^0-9.]/g, ''));
            return pA - pB;
        }).slice(0, 3);
    }

    let combinedHistory = [...userHistory, ...processedHistory];
    
    const uniqueHistory = [];
    const seenIds = new Set();
    for (const item of combinedHistory) {
        if (item && item.id && !seenIds.has(item.id)) {
            seenIds.add(item.id);
            uniqueHistory.push(item);
        }
    }
    uniqueHistory.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return res.status(200).json({ 
        latest: safeLatest,
        history: uniqueHistory.slice(0, 50), 
        userHistory: userHistory,
        saved: savedItems,
        arbitrage: { target: arbitrageTarget, data: arbitrageData }, 
        systemStatus: results[2],
        pusherKey: process.env.NEXT_PUBLIC_PUSHER_KEY || process.env.PUSHER_KEY,
        frankenstein: frankenstein
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error loading data' });
  }
}
