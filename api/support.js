import { Redis } from '@upstash/redis'
import { GoogleGenerativeAI } from "@google/generative-ai";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    
    // --- 1. ANTI-SPAM OCHRANA (Rate Limiting) ---
    const ip = req.headers['x-forwarded-for'] || 'unknown_ip';
    const rateLimitKey = `support_limit:${ip}`;
    
    // Zvýšíme počítadlo
    const requests = await redis.incr(rateLimitKey);
    
    // Pokud je to první request, nastavíme expiraci na 10 minut (600s)
    if (requests === 1) {
        await redis.expire(rateLimitKey, 600);
    }

    // Limit: 5 zpráv za 10 minut
    if (requests > 5) {
        return res.status(429).json({ 
            text: "⚠️ Jsi příliš rychlý. Support Bot si musí odpočinout. Zkus to za chvíli." 
        });
    }
    // -------------------------------------------

    const { message, history } = req.body;

    const systemPrompt = `
    Jsi Support Bot pro aplikaci RigRadar AI.
    Tvé úkoly:
    1. Odpovídat POUZE na otázky ohledně funkcí aplikace, ceníku (Premium stojí $9.99) a řešení problémů.
    2. Pokud se uživatel zeptá na hardware, odkaž ho na sekci "AI Advisor".
    3. Pokud chce kontaktovat admina, řekni mu, ať napíše zprávu sem.
    4. Pokud uživatel napíše "CONTACT_ADMIN: [zpráva]", odpověz: "Ticket created."
    5. Buď stručný.
    `;

    try {
        if (message.toLowerCase().includes("kontakt") || message.toLowerCase().includes("problem")) {
            await redis.lpush('support_tickets', JSON.stringify({
                text: message,
                date: new Date().toISOString(),
                ip: ip // Uložíme i IP pro kontrolu
            }));
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const chat = model.startChat({
            history: [
                { role: "user", parts: [{ text: systemPrompt }] },
                { role: "model", parts: [{ text: "Ok." }] },
                ...(history || []).map(h => ({ role: h.role === 'ai' ? 'model' : 'user', parts: [{ text: h.text }] }))
            ],
        });

        const result = await chat.sendMessage(message);
        const response = result.response.text();

        res.status(200).json({ text: response });

    } catch (error) {
        console.error("Bot Error:", error);
        res.status(500).json({ text: "Omlouvám se, mám výpadek spojení." });
    }
}