import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
    if (req.method === 'GET' && req.query.action === 'unsubscribe' && req.query.id) {
        try {
            await redis.hdel('watchdogs', req.query.id);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(200).send(`
                <body style="background:#050505; color:white; font-family:sans-serif; text-align:center; padding-top:10vh;">
                    <h1 style="color:#3b82f6; letter-spacing: 2px;">🛰️ RigRadar AI</h1>
                    <h2 style="color:#10b981;">Watchdog Deactivated</h2>
                    <p style="color:#9ca3af;">You will no longer receive alerts for this target.</p>
                    <a href="https://rigradarengine.onrender.com" style="color:#3b82f6; text-decoration:none; margin-top:20px; display:inline-block;">Return to Radar</a>
                </body>
            `);
        } catch (e) {
            return res.status(500).send("Error deactivating watchdog.");
        }
    }
    const cookieHeader = req.headers.cookie || '';
    const tokenMatch = cookieHeader.match(/rr_auth_token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const email = await redis.get(`session:${token}`);
    if (!email) return res.status(401).json({ error: 'Session expired' });

    if (req.method === 'POST') {
        const premiumData = await redis.get(`premium:${email}`);
        const isPremium = premiumData && premiumData.isActive === true;
        
        if (!isPremium) {
            return res.status(403).json({ error: 'Watchdog is a Premium exclusive feature.' });
        }

        const { query, stores, targetPrice, condition, interval } = req.body;
        if (!query || !targetPrice) return res.status(400).json({ error: 'Missing parameters' });

        try {
            const watchdogId = `wd_${email}_${Date.now()}`;
            
            const watchdogData = JSON.stringify({
                email,
                query,
                stores: Array.isArray(stores) && stores.length > 0 ? stores : ['ebay'],
                targetPrice: Number(targetPrice),
                condition: condition || 'any',
                interval: Number(interval) || 3600,
                lastScanned: 0,
                timestamp: Date.now()
            });

            await redis.hset('watchdogs', { [watchdogId]: watchdogData });

            return res.status(200).json({ success: true, message: `Watchdog deployed!` });
        } catch (e) {
            console.error("Watchdog Create Error:", e);
            return res.status(500).json({ error: 'Failed to set watchdog' });
        }
    } else if (req.method === 'GET') {
        try {
            const allWatchdogs = await redis.hgetall('watchdogs');
            if (!allWatchdogs) return res.status(200).json({ watchdogs: [] });

            const userWatchdogs = [];
            for (const [id, dataStr] of Object.entries(allWatchdogs)) {
                const data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
                // Vyfiltrujeme jen ty psy, kteří patří aktuálnímu uživateli
                if (data.email === email) {
                    userWatchdogs.push({ id, ...data });
                }
            }

            return res.status(200).json({ watchdogs: userWatchdogs });
        } catch (e) {
            console.error("Watchdog Fetch Error:", e);
            return res.status(500).json({ error: 'Failed to load watchdogs' });
        }
    }

    else if (req.method === 'DELETE') {
        const { watchdogId } = req.body;
        if (!watchdogId) return res.status(400).json({ error: 'Missing Watchdog ID' });

        try {
            const wdDataStr = await redis.hget('watchdogs', watchdogId);
            if (!wdDataStr) return res.status(404).json({ error: 'Watchdog not found' });
            
            const wdData = typeof wdDataStr === 'string' ? JSON.parse(wdDataStr) : wdDataStr;
            if (wdData.email !== email) return res.status(403).json({ error: 'Unauthorized to delete this watchdog' });

            await redis.hdel('watchdogs', watchdogId);
            return res.status(200).json({ success: true });
        } catch (e) {
            console.error("Watchdog Delete Error:", e);
            return res.status(500).json({ error: 'Failed to delete watchdog' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
