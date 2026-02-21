import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  // ---------------------------------------------------------
  // 1. PŘÍJEM DAT Z RADAR.PY (POST)
  // ---------------------------------------------------------
  if (req.method === 'POST') {
    
    // 🔴 NOVÉ: ZABEZPEČENÍ API - Pustíme jen toho, kdo zná heslo
    const apiKey = req.headers['x-radar-api-key'];
    if (apiKey !== process.env.RADAR_API_SECRET) {
        return res.status(401).json({ error: 'Unauthorized radar node. Intrusion detected.' });
    }

    // 🔴 NOVÉ: PŘÍJEM HEARTBEATU Z PYTHONU
    if (req.body.type === 'heartbeat') {
        await redis.set('system_status', { status: 'online', timestamp: Date.now() });
        return res.status(200).json({ status: 'Heartbeat registered' });
    }

    const { price, title, url, store, opinion, score, type, ownerEmail } = req.body;
    
    // Validace základních dat
    if (!price || !opinion) {
      return res.status(400).json({ error: 'Missing data' });
    }

    // Vytvoření objektu scanu
    const newDeal = {
        price, 
        title: title || "Unknown Product",
        url: url || "#",
        store: store || "EBAY", 
        opinion,
        score: score || 50,
        type: type || 'HW',
        ownerEmail: ownerEmail || 'system', // Pokud chybí, je to systémový autopilot
        timestamp: Date.now(),
        id: Date.now().toString() 
    };

    try {
        if (!ownerEmail || ownerEmail === 'system') {
            // --- VEŘEJNÝ SCAN (AUTOPILOT) ---
            // Uložíme jako hlavní "Latest Deal" pro všechny
            await redis.set('latest_deal', newDeal);
            // Přidáme do veřejné historie
            await redis.lpush('deal_history', JSON.stringify(newDeal));
            await redis.ltrim('deal_history', 0, 29); // Držíme posledních 30
        } else {
            // --- SOUKROMÝ SCAN (UŽIVATEL) ---
            // Uložíme JEN do historie konkrétního uživatele
            const userHistoryKey = `user_history:${ownerEmail}`;
            await redis.lpush(userHistoryKey, JSON.stringify(newDeal));
            await redis.ltrim(userHistoryKey, 0, 19); // Držíme jeho posledních 20
        }

        return res.status(200).json({ status: 'Saved' });
    } catch (error) {
        console.error("Redis Error:", error);
        return res.status(500).json({ error: 'Database save failed' });
    }
  }

  // ---------------------------------------------------------
  // 2. NAČÍTÁNÍ DAT PRO FRONTEND (GET)
  // ---------------------------------------------------------
  try {
    // Získáme email uživatele z URL parametru
    const userEmail = req.query.user;

    // Příprava promisů pro Redis (Přidali jsme stahování system_status!)
    const promises = [
        redis.get('latest_deal'),            // Index 0: Veřejný latest
        redis.lrange('deal_history', 0, 19), // Index 1: Veřejná historie
        redis.get('system_status')           // Index 2: 🔴 NOVÉ: Status Radaru (Heartbeat)
    ];

    // Pokud je uživatel přihlášen, stáhneme i jeho soukromou historii a uložené věci
    if (userEmail && userEmail !== 'undefined') {
        promises.push(redis.lrange(`user_history:${userEmail}`, 0, 49)); // Index 3: User historie
        promises.push(redis.lrange(`saved_scans:${userEmail}`, 0, 49));  // Index 4: Saved Items
    }

    const results = await Promise.all(promises);
    const globalLatest = results[0];
    const systemStatusData = results[2]; // 🔴 Načtený Heartbeat z databáze
    
    // Helper funkce pro parsování JSON stringů z Redisu
    const parseItems = (items) => (items || []).map(item => {
        try { return (typeof item === 'string') ? JSON.parse(item) : item; } catch (e) { return null; }
    }).filter(item => item !== null);

    const publicHistory = parseItems(results[1]);
    const userHistory = results[3] ? parseItems(results[3]) : []; // Bude prázdné, pokud není user
    const savedItems = results[4] ? parseItems(results[4]) : [];  // Bude prázdné, pokud není user

    // --- SLOUČENÍ HISTORIE PRO LIVE FEED ---
    // Spojíme veřejné a soukromé scany dohromady pro hlavní stránku
    let combinedHistory = [...userHistory, ...publicHistory];

    // Seřadíme podle času (nejnovější nahoře)
    combinedHistory.sort((a, b) => b.timestamp - a.timestamp);

    // Ořízneme na rozumný počet pro frontend
    combinedHistory = combinedHistory.slice(0, 20);

    // Příprava dat pro graf
    const chartData = combinedHistory.map(item => {
      const numericPrice = parseFloat(item.price.replace(',', '.').replace(/[^0-9.]/g, ''));
      const date = new Date(item.timestamp);
        return {
            x: `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`,
            y: isNaN(numericPrice) ? 0 : numericPrice,
            title: item.title // Přidáme title pro filtrování v grafu
        };
    }).reverse();

    return res.status(200).json({ 
        latest: globalLatest || { price: "---", opinion: "No data", score: 50 },
        history: combinedHistory, // Pro hlavní stránku
        userHistory: userHistory, // Pro history.html (čistě user scany)
        saved: savedItems,        // Pro history.html (uložené věci)
        chartData: chartData,
        systemStatus: systemStatusData // 🔴 NOVÉ: Posíláme info o stavu na frontend!
    });

  } catch (error) {
    console.error("Load Error:", error);
    return res.status(500).json({ error: 'Error loading data' });
  }
}
