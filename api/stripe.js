import { Redis } from '@upstash/redis';
import Stripe from 'stripe';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    // Zjištění typu požadavku z URL (např. /api/stripe?type=checkout)
    const { type } = req.query;

    // 1. ZÍSKÁNÍ TOKENU Z HTTP-ONLY COOKIE (Společné ověření)
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

    // 2. VYKONÁNÍ LOGIKY PODLE TYPU
    try {
        if (type === 'portal') {
            // --- LOGIKA PRO ZÁKAZNICKÝ PORTÁL (Billing Portal) ---
            const premiumData = await redis.get(`premium:${email}`);
            let customerId = premiumData?.customerId;
            
            if (!customerId) {
                // Záchranná brzda - zkusíme najít zákazníka ve Stripe
                const customers = await stripe.customers.list({ email: email, limit: 1 });
                if (customers.data.length === 0) {
                    return res.status(404).json({ error: "No subscription found for this email." });
                }
                customerId = customers.data[0].id;
            }

            const session = await stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: `${req.headers.origin}/account.html`,
            });

            return res.status(200).json({ url: session.url });

        } else if (type === 'checkout') {
            // --- LOGIKA PRO NOVOU PLATBU (Checkout) ---
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

            return res.status(200).json({ url: session.url });

        } else {
            // Pokud není specifikováno ani jedno
            return res.status(400).json({ error: "Invalid action type. Use ?type=portal or ?type=checkout" });
        }
    } catch (err) {
        console.error("Stripe Error:", err);
        return res.status(500).json({ error: err.message });
    }
}
