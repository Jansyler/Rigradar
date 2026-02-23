import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const cookieHeader = req.headers.cookie || '';
    const tokenMatch = cookieHeader.match(/rr_auth_token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const email = await redis.get(`session:${token}`);
    if (!email) return res.status(401).json({ error: 'Session expired' });
    const isPremium = await redis.get(`premium:${email}`);
    if (!isPremium || isPremium !== 'true') {
        return res.status(403).json({ error: 'Upgrade to Premium to unlock CSV Export.' });
    }

    try {
    const savedRaw = await redis.hvals(`saved_scans:${email}`);        
        if (!savedRaw || savedRaw.length === 0) {
            return res.status(404).json({ error: 'No saved data found' });
        }
        let csv = "Title,Price,Store,Opinion,Forecast,Score,Date\n";
        
        savedRaw.forEach(itemStr => {
            try {
                let item = typeof itemStr === 'string' ? JSON.parse(itemStr) : itemStr;
                if (typeof item === 'string') item = JSON.parse(item);

                const date = new Date(item.timestamp).toLocaleDateString();
                                const title = `"${(item.title || '').replace(/"/g, '""')}"`;
                const price = `"${(item.price || '').replace(/"/g, '""')}"`;
                const opinion = `"${(item.opinion || '').replace(/"/g, '""')}"`;
                
                csv += `${title},${price},${item.store || 'WEB'},${opinion},${item.forecast || 'WAIT'},${item.score || 50},${date}\n`;
            } catch (e) { console.error("CSV Parse err on item"); }
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="rigradar_export_${new Date().toISOString().split('T')[0]}.csv"`);
        return res.status(200).send(csv);

    } catch (error) {
        console.error("Export Error:", error);
        return res.status(500).json({ error: 'Server export failed' });
    }
}
