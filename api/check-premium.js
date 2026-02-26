import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const cookieHeader = req.headers.cookie || '';
    const tokenMatch = cookieHeader.match(/rr_auth_token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (!token) {
        return res.status(401).json({ error: "Unauthorized. No cookie found." });
    }

    let verifiedEmail = null;
    try {
        verifiedEmail = await redis.get(`session:${token}`);
    } catch (e) {
        console.error("Session verification failed:", e);
    }

    if (!verifiedEmail) {
        return res.status(401).json({ error: "Session expired." });
    }

    try {
        const premiumData = await redis.get(`premium:${verifiedEmail}`);
        const isPremium = premiumData ? premiumData.isActive === true : false;
        
        return res.status(200).json({ 
            isPremium, 
            email: verifiedEmail,
            customerId: premiumData?.customerId || null 
        });
    } catch (error) {
        console.error("Premium check error:", error);
        return res.status(500).json({ error: "Database error." });
    }
}
