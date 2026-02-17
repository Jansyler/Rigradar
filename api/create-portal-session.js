import Stripe from 'stripe';
import { OAuth2Client } from 'google-auth-library';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const authClient = new OAuth2Client();

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    // 1. Ověření uživatele (stejné jako u ostatních API)
    const authHeader = req.headers.authorization;
    let email = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const ticket = await authClient.verifyIdToken({
                idToken: token,
                audience: "636272588894-duknv543nso4j9sj4j2d1qkq6tc690gf.apps.googleusercontent.com", 
            });
            email = ticket.getPayload().email;
        } catch (e) {
            return res.status(401).json({ error: "Invalid token" });
        }
    }

    if (!email) return res.status(401).json({ error: 'Unauthorized' });

    try {
        // 2. Najdeme zákazníka ve Stripe podle emailu
        const customers = await stripe.customers.list({ email: email, limit: 1 });
        
        if (customers.data.length === 0) {
            return res.status(404).json({ error: "No subscription found for this email." });
        }

        const customerId = customers.data[0].id;

        // 3. Vytvoříme link do zákaznického portálu
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${req.headers.origin}/account.html`,
        });

        res.status(200).json({ url: session.url });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}