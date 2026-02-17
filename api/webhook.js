import { Redis } from '@upstash/redis'
import Stripe from 'stripe';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Pomocná funkce pro čtení raw body (nezbytné pro Vercel)
const buffer = async (readable) => {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // OPRAVA: Musíme nejdříve načíst buffer a ten pak předat do Stripe
        const buf = await buffer(req);
        event = stripe.webhooks.constructEvent(buf, sig, endpointSecret);
    } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const session = event.data.object;
    const email = session.customer_details?.email || session.email;

    if (email) {
        const userKey = `user_data:${email}`;

        // Aktivace Premium
        if (event.type === 'checkout.session.completed' || event.type === 'invoice.paid') {
            let userData = await redis.get(userKey) || { count: 0, isPremium: false, chats: {} };
            userData.isPremium = true;
            await redis.set(userKey, userData);
            console.log(`PREMIUM ACTIVATED: ${email}`);
        }

        // Zrušení Premium
        if (event.type === 'customer.subscription.deleted') {
            let userData = await redis.get(userKey) || { count: 0, isPremium: false, chats: {} };
            userData.isPremium = false;
            await redis.set(userKey, userData);
            console.log(`PREMIUM CANCELED: ${email}`);
        }
    }

    res.json({ received: true });
}

export const config = { api: { bodyParser: false } };