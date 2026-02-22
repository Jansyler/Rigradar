import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    // 1. ZÍSKÁNÍ A OVĚŘENÍ TVÉHO SESSION TOKENU (Z REDISU)
    const authHeader = req.headers.authorization;
    let verifiedEmail = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            // Hledáme email v databázi podle tokenu
            verifiedEmail = await redis.get(`session:${token}`);
        } catch (e) {
            console.error("Redis verification failed:", e);
        }
    }

    if (!verifiedEmail) {
        return res.status(401).json({ error: 'Unauthorized. Please log in again.' });
    }

    // 2. LOGIKA UKLÁDÁNÍ
    const { deal } = req.body;
    if (!deal) return res.status(400).json({ error: 'Missing deal data' });

    try {
        const savedKey = `saved_scans:${verifiedEmail}`;
        
        // Kontrola duplicity (aby uživatel neměl stejnou věc 10x)
        const currentSaved = await redis.lrange(savedKey, 0, -1);
        const isDuplicate = currentSaved.some(item => {
            try {
                const parsed = (typeof item === 'string') ? JSON.parse(item) : item;
                return parsed.id === deal.id || (parsed.title === deal.title && parsed.price === deal.price);
            } catch { return false; }
        });

        if (isDuplicate) return res.status(200).json({ status: 'Already saved' });

        // Uložení
        deal.isSaved = true;
        await redis.lpush(savedKey, JSON.stringify(deal));
        
        // Pojistka: Držíme maximálně 50 uložených věcí na uživatele
        await redis.ltrim(savedKey, 0, 49);

        return res.status(200).json({ status: 'Saved' });

    } catch (error) {
        console.error("Save Error:", error);
        return res.status(500).json({ error: 'Database error' });
    }
}
