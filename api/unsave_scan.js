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
        
        // 1. Načteme všechny uložené scany
        const currentSaved = await redis.lrange(savedKey, 0, -1);
        
        // 2. Vyfiltrujeme ten, který chceme smazat (podle ID)
        // Musíme parsovat JSON, abychom zkontrolovali ID
        const newSavedList = currentSaved.filter(item => {
            try {
                const parsed = JSON.parse(item);
                return parsed.id !== dealId; // Necháme vše, co NENÍ mazaný deal
            } catch { return false; }
        });

        // 3. Přepíšeme seznam v Redisu
        await redis.del(savedKey); // Smažeme starý
        
        if (newSavedList.length > 0) {
            // Redis push bere pole argumentů, ale upstash někdy zlobí s polem,
            // tak to tam pošleme po jednom nebo spreadnem, pokud to knihovna podporuje.
            // Pro jistotu (a zachování pořadí) to tam nasypeme znova zprava (rpush)
            // Protože filter zachoval pořadí, musíme je tam dát tak, aby nejnovější byl vlevo (lpush) nebo zachovat order.
            
            // Jednodušší: Pushneme je tam zpátky. Protože redis lrange vrací 0..-1 (zleva doprava),
            // musíme je tam vrátit ve správném pořadí. rpush zachová pořadí pole.
            await redis.rpush(savedKey, ...newSavedList);
        }
        
        return res.status(200).json({ status: 'Deleted' });

    } catch (error) {
        console.error("Unsave Error:", error);
        return res.status(500).json({ error: 'Database error' });
    }
}