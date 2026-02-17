import Stripe from 'stripe';
import { OAuth2Client } from 'google-auth-library'; // Přidat import

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const authClient = new OAuth2Client(); // Inicializace klienta

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    // 1. ZÍSKÁNÍ A OVĚŘENÍ TOKENU (Stejné jako v chat.js)
    const authHeader = req.headers.authorization;
    let email = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const ticket = await authClient.verifyIdToken({
                idToken: token,
                audience: "636272588894-duknv543nso4j9sj4j2d1qkq6tc690gf.apps.googleusercontent.com", 
            });
            const payload = ticket.getPayload();
            email = payload.email; // Získání ověřeného emailu
        } catch (e) {
            return res.status(401).json({ error: "Invalid token" });
        }
    }

    if (!email) {
        return res.status(401).json({ error: 'Unauthorized: Please log in' });
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: email, // Použijeme ověřený email
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
        res.status(500).json({ error: err.message });
    }
}