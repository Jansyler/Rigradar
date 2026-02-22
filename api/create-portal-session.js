import { Redis } from '@upstash/redis';
import Stripe from 'stripe';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    // 1. ZÍSKÁNÍ TOKENU Z HTTP-ONLY COOKIE
    const cookieHeader = req.headers.cookie || '';
    const tokenMatch = cookieHeader.match(/rr_auth_token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (!token) return res.status(401).json({ error: 'Unauthorized: No cookie' });

    let email = null;
    try {
        email = await redis.get(`session:${token}`);
    } catch (e) {
        console.error("Redis session verification failed:", e);
    }

    if (!email) return res.status(401).json({ error: 'Unauthorized: Session expired' });

    try {
        // 2. Najdeme zákazníka v novém Premium klíči
        const premiumData = await redis.get(`premium:${email}`);
        let customerId = premiumData?.customerId;
        
        if (!customerId) {
            // Záchranná brzda
            const customers = await stripe.customers.list({ email: email, limit: 1 });
            if (customers.data.length === 0) {
                return res.status(404).json({ error: "No subscription found for this email." });
            }
            customerId = customers.data[0].id;
        }

        // 3. Vytvoříme link do zákaznického portálu
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${req.headers.origin}/account.html`,
        });

        res.status(200).json({ url: session.url });
    } catch (err) {
        console.error("Stripe Portal Error:", err);
        res.status(500).json({ error: err.message });
    }
}
