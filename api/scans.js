import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

// 🛡️ POMOCNÁ FUNKCE: Ochrana proti Prompt Injection
const sanitizeQuery = (q) => {
    if (typeof q !== 'string') return '';
    let cleaned = q.replace(/[^a-zA-Z0-9\s\-\.\+]/g, '').trim();
    return cleaned.substring(0, 60);
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action } = req.query; // request | save | unsave

    // 1. SPOLEČNÁ AUTENTIZACE: Získání tokenu a ověření
    const cookieHeader = req.headers.cookie || '';
    const tokenMatch = cookieHeader.match(/rr_auth_token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (!token) return res.status(401).json({ error: 'Unauthorized. No cookie.' });

    let verifiedEmail = null;
    try {
        verifiedEmail = await redis.get(`session:${token}`);
    } catch (e) {
        console.error("Redis verification failed:", e);
    }

    if (!verifiedEmail) {
        return res.status(401).json({ error: 'Unauthorized. Session expired.' });
    }

    // 2. SMĚROVÁNÍ LOGIKY PODLE AKCE
    try {
        if (action === 'request') {
            // --- LOGIKA: VYTVOŘENÍ NOVÉHO SCANU ---
            const { query, stores, condition, minPrice, maxPrice } = req.body;
            
            const cleanQuery = sanitizeQuery(query);
            if (!cleanQuery || cleanQuery.length < 2) {
                return res.status(400).json({ error: 'Invalid or too short search query.' });
            }

            const allowedStores = ['ebay', 'amazon', 'alza', 'bazos'];
            let cleanStores = Array.isArray(stores) ? stores.map(s => String(s).toLowerCase()) : ['ebay'];
            cleanStores = cleanStores.filter(s => allowedStores.includes(s));
            if (cleanStores.length === 0) cleanStores = ['ebay'];

            const validConditions = ['any', 'new', 'used'];
            const cleanCondition = validConditions.includes(condition) ? condition : 'any';

            const cleanMin = minPrice ? Math.abs(Number(minPrice)) : null;
            const cleanMax = maxPrice ? Math.abs(Number(maxPrice)) : null;

            const premiumData = await redis.get(`premium:${verifiedEmail}`);
            const isPremium = premiumData ? premiumData.isActive === true : false;

            if (!isPremium) {
                const premiumStores = ['amazon', 'alza'];
                const wantsPremiumStore = cleanStores.some(store => premiumStores.includes(store));
                if (wantsPremiumStore) {
                    return res.status(403).json({ error: 'Amazon and Alza are for Premium users only.' });
                }
            }

            const task = JSON.stringify({
                query: cleanQuery,
                stores: cleanStores,
                ownerEmail: verifiedEmail,
                condition: cleanCondition,
                minPrice: cleanMin,
                maxPrice: cleanMax,
                timestamp: Date.now(),
                priority: isPremium,
                source: 'user_request'
            });

            await redis.rpush('scan_queue', task);
            return res.status(200).json({ success: true, message: 'Scan queued successfully' });
        }else if (action === 'save') {
            // --- LOGIKA: ULOŽENÍ SCANU DO ARCHIVU (REDIS HASH) ---
            const { deal } = req.body;
            if (!deal || !deal.id) return res.status(400).json({ error: 'Invalid deal data' });

            const savedKey = `saved_scans:${verifiedEmail}`;
            const dealId = String(deal.id);

            // 1. Check if already exists in O(1) time
            const exists = await redis.hexists(savedKey, dealId);
            if (exists) return res.status(200).json({ status: 'Already saved' });

            // 2. Check limits (Hashes don't have ltrim, so we use hlen)
            const currentSize = await redis.hlen(savedKey);
            if (currentSize >= 50) {
                return res.status(403).json({ error: 'Archive full. Please remove old scans first.' });
            }

            // 3. Save as a Hash field in O(1) time
            const dealString = JSON.stringify(deal);
            await redis.hset(savedKey, { [dealId]: dealString });
            
            return res.status(200).json({ status: 'Saved', id: deal.id });

        } else if (action === 'unsave') {
            // --- LOGIKA: SMAZÁNÍ SCANU Z ARCHIVU (REDIS HASH) ---
            const { dealId } = req.body; 
            if (!dealId) return res.status(400).json({ error: 'Missing dealId' });

            const savedKey = `saved_scans:${verifiedEmail}`;
            
            // 1. Delete instantly in O(1) time using the dealId as the hash field
            const deleted = await redis.hdel(savedKey, String(dealId));

            if (deleted === 0) {
                return res.status(200).json({ status: 'Not found or already deleted' });
            }
            
            return res.status(200).json({ status: 'Deleted' });

        } else {
            return res.status(400).json({ error: 'Invalid action parameter' });
        }

    } catch (error) {
        console.error(`Scan Action Error (${action}):`, error);
        return res.status(500).json({ error: 'Database error' });
    }
}
