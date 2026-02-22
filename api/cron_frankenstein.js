import { Redis } from '@upstash/redis';
import { GoogleGenerativeAI } from '@google/generative-ai';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

    // 🛡️ ZABEZPEČENÍ: Povolí přístup POUZE Vercelu (nebo komukoliv, kdo zná heslo)
    // Pokud to chceš testovat ručně v prohlížeči, dočasně tyto 3 řádky zakomentuj
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized: Invalid CRON_SECRET.' });
    }

    try {
        // 1. Načtení posledních 40 úlovků z globální historie
        const historyRaw = await redis.lrange('global_history', 0, 40);
        if (!historyRaw || historyRaw.length < 5) {
            return res.status(200).json({ message: "Not enough parts in radar history to build." });
        }

        const partsList = historyRaw.map(item => {
            const d = typeof item === 'string' ? JSON.parse(item) : item;
            return `- ${d.title} for ${d.price} (${d.store})`;
        }).join('\n');

        // 2. Instruujeme Gemini jako šíleného vědce
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            systemInstruction: "You are the 'Mad Scientist' of RigRadar. Your job is to create a daily PC build called 'Frankenstein Build' from a list of parts. It must be as cheap and functional as possible. Be witty and slightly insane."
        });

        const prompt = `
        Latest hardware parts found:
        ${partsList}

        Task: Create a functional PC build using some of these parts. You can fill in generic cheap items (like 'Generic Case') if a part is missing.
        Return ONLY a JSON object:
        {
            "title": "Build Name (e.g. The $250 Garbage King)",
            "total_price": "Total price",
            "commentary": "Funny 2-sentence expert commentary.",
            "parts": ["CPU: ...", "GPU: ...", "RAM: ...", "PSU: ..."]
        }`;

        const result = await model.generateContent(prompt);
        let text = result.response.text().trim();
        // Očištění od případných markdown značek
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const buildData = JSON.parse(text);
        buildData.timestamp = Date.now();

        // 3. Uložení do Redisu pro zobrazení na webu
        await redis.set('frankenstein_build', JSON.stringify(buildData));

        return res.status(200).json({ success: true, build: buildData });
    } catch (e) {
        console.error("Cron Error:", e);
        return res.status(500).json({ error: e.message });
    }
}
