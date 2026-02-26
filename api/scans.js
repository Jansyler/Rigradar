import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const sanitizeQuery = (q) => {
    if (typeof q !== 'string') return '';
    let cleaned = q.replace(/[^a-zA-Z0-9\s\-\.\+]/g, '').trim();
    return cleaned.substring(0, 60);
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action } = req.query;

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
    
    try {
        if (action === 'request') {
            const { query, stores, condition, minPrice, maxPrice } = req.body;
            
            const cleanQuery = sanitizeQuery(query);
            if (!cleanQuery || cleanQuery.length < 2) {
                return res.status(400).json({ error: 'Invalid or too short search query.' });
            }

            const allowedStores = [
                'ebay', 'amazon', 'alza', 'bazos', 'newegg', 
                'mironet', 'datart', 'hellocomp', 'czc', 'tsbohemia', 
                'mindfactory', 'caseking', 'bestbuy', 'bhphoto'
            ];
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
                const totalScansKey = `total_scans_count:${verifiedEmail}`;
                const totalScans = await redis.get(totalScansKey) || 0;

                if (totalScans >= 3) {
                    return res.status(403).json({ 
                        error: 'Free plan limit reached (3 scans). Upgrade to Premium for unlimited satellite deployments.' 
                    });
                }
                await redis.incr(totalScansKey);
            }
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

            if (isPremium) {
                await redis.lpush('scan_queue', task); 
            } else {
                await redis.rpush('scan_queue', task);
            }

            return res.status(200).json({ success: true, message: 'Scan queued successfully' });
            
        } else if (action === 'save') {
            const { deal } = req.body;
            if (!deal || !deal.id) return res.status(400).json({ error: 'Invalid deal data' });

            const savedKey = `saved_scans:${verifiedEmail}`;
            const dealId = String(deal.id);

            const exists = await redis.hexists(savedKey, dealId);
            if (exists) return res.status(200).json({ status: 'Already saved' });

            const currentSize = await redis.hlen(savedKey);
            if (currentSize >= 50) {
                return res.status(403).json({ error: 'Archive full. Please remove old scans first.' });
            }

            const dealString = JSON.stringify(deal);
            await redis.hset(savedKey, { [dealId]: dealString });
            
            return res.status(200).json({ status: 'Saved', id: deal.id });

        } else if (action === 'unsave') {
            const { dealId } = req.body; 
            if (!dealId) return res.status(400).json({ error: 'Missing dealId' });

            const savedKey = `saved_scans:${verifiedEmail}`;
            
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
