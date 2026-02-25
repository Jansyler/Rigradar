import { Redis } from '@upstash/redis';
import Stripe from 'stripe';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    const cookieHeader = req.headers.cookie || '';
    const tokenMatch = cookieHeader.match(/rr_auth_token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    let email = await redis.get(`session:${token}`);
    if (!email) return res.status(401).json({ error: 'Session expired' });

    const { action } = req.query;

    try {
        if (req.method === 'POST' && action === 'create') {
            let customerId;
            const premiumData = await redis.get(`premium:${email}`);
            
            if (premiumData && premiumData.customerId) {
                customerId = premiumData.customerId;
            } else {
                const customers = await stripe.customers.list({ email, limit: 1 });
                if (customers.data.length > 0) customerId = customers.data[0].id;
                else {
                    const customer = await stripe.customers.create({ email });
                    customerId = customer.id;
                }
            }

            // ÚKLID: Zruší staré nedokončené pokusy
            const incompleteSubs = await stripe.subscriptions.list({ customer: customerId, status: 'incomplete' });
            for (const sub of incompleteSubs.data) {
                await stripe.subscriptions.cancel(sub.id);
            }

            const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active' });
            if (subs.data.length > 0) return res.status(400).json({ error: 'Already subscribed' });

            const subscription = await stripe.subscriptions.create({
                customer: customerId,
                items: [{ price: 'price_1T4k69E8RZqAxyp4h2AyWV1W' }], 
                payment_behavior: 'default_incomplete',
                payment_settings: { save_default_payment_method: 'on_subscription' },
                expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
            });

            // 🟢 NEPRŮSTŘELNÉ ZÍSKÁNÍ KLÍČE
            let clientSecret = null;

            // 1. Zkusíme to z faktury (A stáhneme ji ručně, pokud máme jen ID)
            if (subscription.latest_invoice) {
                let invoice = subscription.latest_invoice;
                if (typeof invoice === 'string') {
                    invoice = await stripe.invoices.retrieve(invoice);
                }
                if (invoice.payment_intent) {
                    let pi = invoice.payment_intent;
                    if (typeof pi === 'string') {
                        pi = await stripe.paymentIntents.retrieve(pi);
                    }
                    clientSecret = pi.client_secret;
                }
            }

            // 2. Záloha ze setup_intent
            if (!clientSecret && subscription.pending_setup_intent) {
                let si = subscription.pending_setup_intent;
                if (typeof si === 'string') {
                    si = await stripe.setupIntents.retrieve(si);
                }
                clientSecret = si.client_secret;
            }

            if (!clientSecret) {
                console.error("Stripe nám klíč nedal. Zde jsou data:", JSON.stringify(subscription, null, 2));
                throw new Error("Stripe vytvořil předplatné, ale nedal nám klíč. Podívej se do Vercel Logů.");
            }

            return res.status(200).json({
                clientSecret: clientSecret,
                subscriptionId: subscription.id,
                publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
            });
        }

        if (req.method === 'GET') {
            const premiumData = await redis.get(`premium:${email}`);
            if (!premiumData || !premiumData.customerId) return res.status(200).json({ active: false });

            const subs = await stripe.subscriptions.list({ customer: premiumData.customerId, status: 'active' });
            if (subs.data.length === 0) return res.status(200).json({ active: false });

            const sub = subs.data[0];
            return res.status(200).json({
                active: true,
                cancel_at_period_end: sub.cancel_at_period_end,
                current_period_end: sub.current_period_end,
                id: sub.id
            });
        }

        if (req.method === 'POST' && action === 'cancel') {
            const { subscriptionId } = req.body;
            if (!subscriptionId) return res.status(400).json({ error: 'Missing subscription ID' });

            const sub = await stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: true
            });

            return res.status(200).json({ success: true, cancel_at_period_end: sub.cancel_at_period_end });
        }

        return res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
        console.error("Stripe UI API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
