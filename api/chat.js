import { Redis } from '@upstash/redis'
import { GoogleGenerativeAI } from "@google/generative-ai";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
    // 1. ZÍSKÁNÍ A OVĚŘENÍ NAŠEHO SESSION TOKENU
    const authHeader = req.headers.authorization;
    let email = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            email = await redis.get(`session:${token}`);
        } catch (e) {
            console.error("Redis session verification failed:", e);
        }
    }

    if (!email) return res.status(401).json({ text: "Session expired. Please log in again." });

    const userKey = `user_data:${email}`;

    // ==========================================
    // GET: Načtení historie a postranního panelu
    // ==========================================
    if (req.method === 'GET') {
        const { chatId } = req.query; 

        try {
            if (chatId) {
                // Pokud frontend žádá o konkrétní chat, pošleme jen jeho zprávy
                const history = await redis.get(`chat_history:${email}:${chatId}`) || [];
                return res.status(200).json({ history });
            } else {
                // Pokud frontend žádá jen o seznam chatů (pro Sidebar)
                const userData = await redis.get(userKey);
                const safeChats = userData?.chats || {};
                Object.keys(safeChats).forEach(k => delete safeChats[k].history); 
                return res.status(200).json({ chats: safeChats });
            }
        } catch (err) {
            return res.status(200).json({ chats: {}, history: [] });
        }
    }

    if (req.method !== 'POST') return res.status(405).end();
    
    // ==========================================
    // POST: Nová zpráva pro AI
    // ==========================================
    const { message, lang, chatId } = req.body;
    const currentChatId = chatId || `chat_${Date.now()}`;
    const chatHistoryKey = `chat_history:${email}:${currentChatId}`; 

    try {
        // 1. Načtení základních metadat (seznam chatů)
        let userData = await redis.get(userKey) || { isPremium: false, chats: {} };
        if (Array.isArray(userData.chats)) userData.chats = {}; 

        // 🚨 OPRAVA RACE CONDITION: Denní limity řešíme odděleně a atomicky!
        const today = new Date().toISOString().split('T')[0]; // Získáme dnešní datum (např. "2023-10-27")
        const usageKey = `usage_chat:${email}:${today}`;
        
        const currentUsage = await redis.get(usageKey) || 0;
        const DAILY_LIMIT = 5;

        // Kontrola Free limitu na základě odděleného klíče
        if (!userData.isPremium && parseInt(currentUsage) >= DAILY_LIMIT) {
            return res.status(403).json({ 
                text: `Daily limit (${DAILY_LIMIT} messages) reached! Limit resets at midnight or upgrade to Premium.`, 
                limitReached: true 
            });
        }

        // Vytvoříme záznam v Sidebaru pouze s názvem (bez historie)
        if (!userData.chats[currentChatId]) {
            userData.chats[currentChatId] = { title: message.substring(0, 30) + "..." };
        }

        // 2. NAČTENÍ HISTORIE ZPRÁV
        let chatHistory = await redis.get(chatHistoryKey);
        
        // Migrační pojistka (přesun starých dat)
        if (!chatHistory && userData.chats[currentChatId]?.history) {
            chatHistory = userData.chats[currentChatId].history;
            delete userData.chats[currentChatId].history; 
        }
        chatHistory = chatHistory || [];

        // 3. Volání AI s historií
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const formattedHistory = chatHistory.map(msg => ({
            role: msg.role === 'ai' ? 'model' : 'user',
            parts: [{ text: msg.text }]
        }));

        const chat = model.startChat({ history: formattedHistory });
        const result = await chat.sendMessage(`Respond in ${lang || 'en'}. User: ${message}`);
        const aiResponse = result.response.text();

        // 4. Uložení zpráv do pole
        chatHistory.push({ role: 'user', text: message });
        chatHistory.push({ role: 'ai', text: aiResponse });
        
        // 5. PARALELNÍ ULOŽENÍ DO DATABÁZE
        const dbPromises = [
            redis.set(userKey, userData),             // Uložíme metadata a seznam chatů
            redis.set(chatHistoryKey, chatHistory)    // Uložíme historii zpráv vedle
        ];

        // Zvýšení počítadla a nastavení expirace (atomická operace)
        if (!userData.isPremium) {
            dbPromises.push(redis.incr(usageKey));
            dbPromises.push(redis.expire(usageKey, 60 * 60 * 48)); // Klíč se po 48 hodinách sám smaže, ať neplní paměť
        }

        await Promise.all(dbPromises);

        res.status(200).json({ text: aiResponse, chatId: currentChatId });

    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ text: "System overload. Try again later." });
    }
}
