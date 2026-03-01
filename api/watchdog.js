import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const RESEND_API_KEY = process.env.RESEND_API_KEY; 
const CRON_SECRET = process.env.CRON_SECRET; 

export default async function handler(req, res) {
    const { action } = req.query;
    if (req.method === 'GET' && action === 'unsubscribe' && req.query.id) {
        try {
            await redis.hdel('watchdogs', req.query.id);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(200).send(`
                <body style="background:#050505; color:white; font-family:sans-serif; text-align:center; padding-top:10vh;">
                    <h1 style="color:#3b82f6; letter-spacing: 2px;">🛰️ RigRadar AI</h1>
                    <h2 style="color:#10b981;">Watchdog Deactivated</h2>
                    <p style="color:#9ca3af;">You will no longer receive alerts for this target.</p>
                    <a href="https://rigradarai.com" style="color:#3b82f6; text-decoration:none; margin-top:20px; display:inline-block;">Return to Radar</a>
                </body>
            `);
        } catch (e) {
            return res.status(500).send("Error deactivating watchdog.");
        }
    }
    if (req.method === 'GET' && action === 'cron') {
        const authHeader = req.headers.authorization;
        if (authHeader !== `Bearer ${CRON_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized CRON execution' });
        }

        try {
            const allWatchdogs = await redis.hgetall('watchdogs') || {};
            const historyRaw = await redis.lrange('global_history', 0, 200); 
            const marketHistory = historyRaw.map(item => typeof item === 'string' ? JSON.parse(item) : item);

            for (const [wdId, wdDataStr] of Object.entries(allWatchdogs)) {
                const wd = typeof wdDataStr === 'string' ? JSON.parse(wdDataStr) : wdDataStr;
                const now = Date.now();

                const intervalMs = parseInt(wd.interval) * 1000;
                if (now - (wd.lastScanned || 0) < intervalMs) continue; 
                
                wd.lastScanned = now;

                const keywords = wd.query.toLowerCase().split(' ');
                const matches = marketHistory.filter(deal => 
                    deal.title && keywords.every(kw => deal.title.toLowerCase().includes(kw))
                );

                let bestDeal = null;
                let lowestPrice = Infinity;

                matches.forEach(deal => {
                    let pStr = deal.price || "0";
                    if(String(pStr).includes(":")) pStr = pStr.split(":")[1].trim();
                    const pNum = parseFloat(String(pStr).replace(/[^0-9.]/g, ''));
                    if (pNum > 0 && pNum < lowestPrice) {
                        lowestPrice = pNum;
                        bestDeal = deal;
                    }
                });

                if (bestDeal && lowestPrice <= parseFloat(wd.targetPrice)) {
                    if (!wd.lastEmailedPrice || lowestPrice < wd.lastEmailedPrice) {
if (RESEND_API_KEY) {
    const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: 'RigRadar Alerts <alerts@rigradarai.com>', 
            to: wd.email,
            subject: `🚨 Price Drop: ${wd.query} is now $${lowestPrice}!`,
            html: `
                <div style="font-family: Arial, sans-serif; background: #050505; color: white; padding: 30px; border-radius: 10px;">
                    <h2 style="color: #3b82f6;">RigRadar Watchdog Triggered! 🐕</h2>
                    <p>Your target hardware dropped below your target price of $${wd.targetPrice}.</p>
                    <div style="background: #111; padding: 20px; border-radius: 10px; border: 1px solid #222; margin: 20px 0;">
                        <h3 style="margin: 0 0 10px 0;">${bestDeal.title}</h3>
                        <p style="font-size: 24px; color: #10b981; font-weight: bold; margin: 0;">$${lowestPrice}</p>
                        <p style="color: #888; font-size: 12px; text-transform: uppercase;">Store: ${bestDeal.store}</p>
                    </div>
                    <a href="https://rigradarai.com/?dealId=${bestDeal.id}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Grab the Deal ↗</a>
                    <br><br>
                    <a href="https://rigradarai.com/api/watchdog?action=unsubscribe&id=${wdId}" style="color: #888; font-size: 10px;">Turn off this alert</a>
                </div>
            `
        })
    });
        const resendData = await resendRes.json();
    if (!resendRes.ok) {
        console.error("❌ RESEND ERROR pro email", wd.email, ":", resendData);
    } else {
        console.log("✅ EMAIL ODESLÁN ÚSPĚŠNĚ pro:", wd.email);
        wd.lastEmailedPrice = lowestPrice; 
    }
} else {
    console.error("❌ CHYBÍ RESEND_API_KEY ve Vercel env variables!");
}
                    }
                } else {
                    const task = JSON.stringify({
                        query: wd.query,
                        stores: wd.stores || ['ebay'],
                        ownerEmail: wd.email,
                        condition: wd.condition || 'any',
                        maxPrice: wd.targetPrice,
                        timestamp: Date.now(),
                        priority: true,
                        source: 'watchdog_auto'
                    });
                    await redis.lpush('scan_queue', task);
                }

                await redis.hset('watchdogs', { [wdId]: JSON.stringify(wd) });
            }

            return res.status(200).json({ status: 'Watchdog scan complete' });

        } catch (error) {
            console.error("Cron Error:", error);
            return res.status(500).json({ error: 'Cron failed' });
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
                timestamp: Date.now(),
                lastEmailedPrice: null
            });

            await redis.hset('watchdogs', { [watchdogId]: watchdogData });

            return res.status(200).json({ success: true, message: `Watchdog deployed!` });
        } catch (e) {
            return res.status(500).json({ error: 'Failed to set watchdog' });
        }
    } else if (req.method === 'GET') {
        try {
            const allWatchdogs = await redis.hgetall('watchdogs');
            if (!allWatchdogs) return res.status(200).json({ watchdogs: [] });

            const userWatchdogs = [];
            for (const [id, dataStr] of Object.entries(allWatchdogs)) {
                const data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
                if (data.email === email) {
                    userWatchdogs.push({ id, ...data });
                }
            }

            return res.status(200).json({ watchdogs: userWatchdogs });
        } catch (e) {
            return res.status(500).json({ error: 'Failed to load watchdogs' });
        }
    } else if (req.method === 'DELETE') {
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
            return res.status(500).json({ error: 'Failed to delete watchdog' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
