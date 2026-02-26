import { Redis } from '@upstash/redis'
import Stripe from 'stripe';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

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
        const buf = await buffer(req);
        event = stripe.webhooks.constructEvent(buf, sig, endpointSecret);
    } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const stripeObject = event.data.object;
    
    let email = stripeObject.customer_details?.email || stripeObject.customer_email || stripeObject.metadata?.user_email;

    try {
        if (!email && stripeObject.customer) {
            const customer = await stripe.customers.retrieve(stripeObject.customer);
            email = customer.email;
        }

        if (email) {
            const userKey = `user_data:${email}`;

            if (event.type === 'checkout.session.completed' || event.type === 'invoice.paid') {
                await redis.set(`premium:${email}`, { isActive: true, customerId: stripeObject.customer });
                console.log(`✅ PREMIUM ACTIVATED: ${email}`);
            }

            if (event.type === 'customer.subscription.deleted') {
                await redis.del(`premium:${email}`);
                console.log(`❌ PREMIUM CANCELED: ${email}`);
            }
        } else {
            console.log("⚠️ Webhook received but no email could be resolved.", event.type);
        }

        res.json({ received: true });
    } catch (error) {
        console.error("Webhook processing error:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

export const config = { api: { bodyParser: false } };
