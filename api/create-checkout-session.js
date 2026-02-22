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

    if (!email) {
        return res.status(401).json({ error: 'Unauthorized: Session expired' });
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: email, 
            line_items: [{
                price: 'price_1Szk6wE8RZqAxyp4jTHjLBJH', 
                quantity: 1,
            }],
            mode: 'subscription',
            success_url: `${req.headers.origin}/chat.html?success=true`,
            cancel_url: `${req.headers.origin}/pricing.html?canceled=true`,
        });

        res.status(200).json({ url: session.url });
    } catch (err) {
        console.error("Stripe Checkout Error:", err);
        res.status(500).json({ error: err.message });
    }
}
