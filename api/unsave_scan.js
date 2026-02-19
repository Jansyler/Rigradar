import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { dealId, email } = req.body;

    if (!dealId || !email) return res.status(400).json({ error: 'Missing data' });

    try {
        const savedKey = `saved_scans:${email}`;
        
        // 1. Načteme všechny uložené scany (Upstash je většinou už vrátí jako objekty)
        const currentSaved = await redis.lrange(savedKey, 0, -1);
        
        // 2. Vyfiltrujeme ten, který chceme smazat
        const newSavedList = currentSaved.filter(item => {
            try {
                // Pokud už je to objekt, rovnou ho použijeme. Pokud je to text, parsujeme ho.
                const parsed = typeof item === 'string' ? JSON.parse(item) : item;
                
                // Převedeme na stringy pro jistotu, kdyby se typy neshodovaly (číslo vs string)
                return String(parsed.id) !== String(dealId); 
            } catch (e) { 
                console.error("Parse error for item:", e);
                // Když nastane chyba, položku v seznamu RADĚJI PONECHÁME, abychom nesmazali vše
                return true; 
            }
        });

        // 3. Přepíšeme seznam v Redisu
        await redis.del(savedKey); // Smažeme starý
        
        if (newSavedList.length > 0) {
            // Pushneme ty zbývající zpátky. Upstash si je zase automaticky stringifikuje.
            await redis.rpush(savedKey, ...newSavedList);
        }
        
        return res.status(200).json({ status: 'Deleted' });

    } catch (error) {
        console.error("Unsave Error:", error);
        return res.status(500).json({ error: 'Database error' });
    }
}
