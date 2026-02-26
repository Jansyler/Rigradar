import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const cookieHeader = req.headers.cookie || '';
    const tokenMatch = cookieHeader.match(/rr_auth_token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const email = await redis.get(`session:${token}`);
    if (!email) return res.status(401).json({ error: 'Session expired' });

    const premiumData = await redis.get(`premium:${email}`);
    const isPremium = premiumData && premiumData.isActive === true;
    
    if (!isPremium) {
        return res.status(403).json({ error: 'Watchdog is a Premium exclusive feature.' });
    }

    const { query, store, targetPrice, condition } = req.body;
    if (!query || !targetPrice) return res.status(400).json({ error: 'Missing parameters' });

    try {
        const watchdogId = `${email}_${query.replace(/\s+/g, '_')}`;
        
        const watchdogData = JSON.stringify({
            email,
            query,
            store: store || 'ebay',
            targetPrice: Number(targetPrice),
            condition: condition || 'any',
            timestamp: Date.now()
        });

        await redis.hset('watchdogs', { [watchdogId]: watchdogData });

        return res.status(200).json({ success: true, message: `Watchdog set for ${query} under $${targetPrice}` });
    } catch (e) {
        console.error("Watchdog Error:", e);
        return res.status(500).json({ error: 'Failed to set watchdog' });
    }
}
