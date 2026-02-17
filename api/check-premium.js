import { Redis } from '@upstash/redis'
import { OAuth2Client } from 'google-auth-library';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const authClient = new OAuth2Client();

export default async function handler(req, res) {
    // Povolíme pouze GET requesty
    if (req.method !== 'GET') return res.status(405).end();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Missing token" });
    }

    const token = authHeader.split(' ')[1];

    try {
        // 1. Ověříme Google Token
        const ticket = await authClient.verifyIdToken({
            idToken: token,
            audience: "636272588894-duknv543nso4j9sj4j2d1qkq6tc690gf.apps.googleusercontent.com", 
        });
        const email = ticket.getPayload().email;

        // 2. Zkontrolujeme status v Redisu
        // Klíč musí odpovídat tomu, co zapisuje webhook (user_premium:email)
        // Redis vrací string "true", pokud klíč existuje a má tuto hodnotu
        const isPremium = await redis.get(`user_premium:${email}`);

        return res.status(200).json({ 
            isPremium: isPremium === 'true' 
        });

    } catch (e) {
        console.error("Check Premium Error:", e);
        return res.status(401).json({ error: "Invalid token" });
    }
}