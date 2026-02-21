import { Redis } from '@upstash/redis';
import Stripe from 'stripe';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    // 1. ZÍSKÁNÍ A OVĚŘENÍ NAŠEHO SESSION TOKENU
    const authHeader = req.headers.authorization;
    let email = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            email = await redis.get(`session:${token}`);
        } catch (e) {
            console.error("Redis session verification failed:", e);
        }
    }

    if (!email) return res.status(401).json({ error: 'Unauthorized' });

    try {
        // 2. Najdeme zákazníka (Customer ID) v naší Redis databázi
        const userData = await redis.get(`user_data:${email}`);
        
        if (!userData || !userData.stripeCustomerId) {
            // Pokud ho v Redisu nemáme, zkusíme najít zákazníka přímo ve Stripe (záchranná brzda)
            const customers = await stripe.customers.list({ email: email, limit: 1 });
            if (customers.data.length === 0) {
                return res.status(404).json({ error: "No subscription found for this email." });
            }
            userData.stripeCustomerId = customers.data[0].id;
        }

        // 3. Vytvoříme link do zákaznického portálu
        const session = await stripe.billingPortal.sessions.create({
            customer: userData.stripeCustomerId,
            return_url: `${req.headers.origin}/account.html`,
        });

        res.status(200).json({ url: session.url });
    } catch (err) {
        console.error("Stripe Portal Error:", err);
        res.status(500).json({ error: err.message });
    }
}
