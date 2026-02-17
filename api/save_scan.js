import { Redis } from '@upstash/redis'
import { OAuth2Client } from 'google-auth-library';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const authClient = new OAuth2Client();

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    // 1. ZÍSKÁNÍ A OVĚŘENÍ TOKENU
    const authHeader = req.headers.authorization;
    let verifiedEmail = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const ticket = await authClient.verifyIdToken({
                idToken: token,
                audience: "636272588894-duknv543nso4j9sj4j2d1qkq6tc690gf.apps.googleusercontent.com", 
            });
            verifiedEmail = ticket.getPayload().email;
        } catch (e) {
            return res.status(401).json({ error: "Invalid token" });
        }
    }

    if (!verifiedEmail) return res.status(401).json({ error: 'Unauthorized' });

    // 2. LOGIKA UKLÁDÁNÍ
    const { deal } = req.body;
    if (!deal) return res.status(400).json({ error: 'Missing deal data' });

    try {
        const savedKey = `saved_scans:${verifiedEmail}`; // Použijeme ověřený email!
        
        // Kontrola duplicity
        const currentSaved = await redis.lrange(savedKey, 0, -1);
        const isDuplicate = currentSaved.some(item => {
            try {
                const parsed = JSON.parse(item);
                return parsed.id === deal.id || (parsed.title === deal.title && parsed.price === deal.price);
            } catch { return false; }
        });

        if (isDuplicate) return res.status(200).json({ status: 'Already saved' });

        deal.isSaved = true;
        await redis.lpush(savedKey, JSON.stringify(deal));
        
        return res.status(200).json({ status: 'Saved' });

    } catch (error) {
        console.error("Save Error:", error);
        return res.status(500).json({ error: 'Database error' });
    }
}