import { Redis } from '@upstash/redis';
import Stripe from 'stripe';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    // 1. ZÍSKÁNÍ A OVĚŘENÍ NAŠEHO SESSION TOKENU (Přes Redis)
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

    if (!email) {
        return res.status(401).json({ error: 'Unauthorized: Please log in' });
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
