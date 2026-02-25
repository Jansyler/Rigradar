import { Redis } from '@upstash/redis'
import { GoogleGenerativeAI } from "@google/generative-ai";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const sanitizeMessage = (msg) => {
    if (typeof msg !== 'string') return '';
    const limited = msg.substring(0, 500).trim(); 
    return limited.replace(/[\x00-\x1F\x7F]/g, ""); 
};

export default async function handler(req, res) {
    const cookieHeader = req.headers.cookie || '';
    const tokenMatch = cookieHeader.match(/rr_auth_token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (!token) {
        return res.status(401).json({ text: "Session expired. Please log in again." });
    }

    let email = null;
    try {
        email = await redis.get(`session:${token}`);
    } catch (e) {
        console.error("Redis session verification failed:", e);
    }

    if (!email) return res.status(401).json({ text: "Session expired. Please log in again." });

    const userKey = `user_data:${email}`;
    if (req.method === 'GET') {
        const { chatId } = req.query; 

        try {
            if (chatId) {
                const history = await redis.get(`chat_history:${email}:${chatId}`) || [];
                return res.status(200).json({ history });
            } else {
                const userData = await redis.get(userKey);
                const safeChats = userData?.chats || {};
                Object.keys(safeChats).forEach(k => delete safeChats[k].history); 
                return res.status(200).json({ chats: safeChats });
            }
        } catch (err) {
            return res.status(200).json({ chats: {}, history: [] });
        }
    }
    const { message, lang, chatId, image } = req.body;
    
    const cleanMessage = sanitizeMessage(message) || "";
    
    if (!cleanMessage && !image) return res.status(400).json({ text: "Empty or invalid message." });

    const currentChatId = chatId || `chat_${Date.now()}`;
    const chatHistoryKey = `chat_history:${email}:${currentChatId}`; 

try {
        let userData = await redis.get(userKey) || { chats: {} };
        if (Array.isArray(userData.chats)) userData.chats = {}; 

        const premiumData = await redis.get(`premium:${email}`);
        const isPremium = premiumData && premiumData.isActive === true;

        const today = new Date().toISOString().split('T')[0]; 
        const usageKey = `usage_chat:${email}:${today}`;
        const DAILY_LIMIT = 5;

        if (image && !isPremium) {
            return res.status(403).json({ 
                text: "Visual diagnostics and image uploads are strictly for Premium users. Upgrade to analyze motherboard layouts, error codes, and hardware setups." 
            });
        }

        if (!isPremium) {
            const currentUsage = await redis.incr(usageKey);
            
            if (currentUsage === 1) {
                await redis.expire(usageKey, 60 * 60 * 48);
            }
            if (currentUsage > DAILY_LIMIT) {
                await redis.decr(usageKey); 
                
                return res.status(403).json({ 
                    text: `Daily limit (${DAILY_LIMIT} messages) reached! Limit resets at midnight or upgrade to Premium.`, 
                    limitReached: true 
                });
            }
        }
        
        if (!userData.chats[currentChatId]) {
            const titleText = cleanMessage ? cleanMessage.substring(0, 30) : "Image Analysis";
            userData.chats[currentChatId] = { title: titleText + "..." };
        }

        let chatHistory = await redis.get(chatHistoryKey);
        if (!chatHistory && userData.chats[currentChatId]?.history) {
            chatHistory = userData.chats[currentChatId].history;
            delete userData.chats[currentChatId].history; 
        }
        chatHistory = chatHistory || [];

        const globalHistoryRaw = await redis.lrange('global_history', 0, 19) || [];
        const marketContext = globalHistoryRaw.map(item => {
            try {
                const p = JSON.parse(item);
                return `${p.title}: ${p.price} at ${p.store} (${p.opinion})`;
            } catch(e) { return ''; }
        }).join('\n');

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash", 
            systemInstruction: `You are the RigRadar Elite PC Genius & IT Expert. 
            You have mastered computer technology from A to Z. You can build a PC blindfolded and fix any software or hardware issue.

            MARKET CONTEXT (Recent Scans):
            ${marketContext || "No recent scan data available."}

            CORE GUIDELINES:
            1. MULTILINGUAL: Always respond in the same language the user is speaking to you.
            2. UNIVERSAL IT KNOWLEDGE: You provide expert advice on EVERYTHING related to PCs: building, upgrading, troubleshooting (e.g., PC won't turn on, BSOD, driver issues), overclocking, and software optimization.
            3. VISUAL DIAGNOSTICS: If the user provides an image, act as a senior technician. Identify components, point out incorrect wiring, assess physical damage, or read error screens.
            4. BOTTLENECK & POWER SAFETY: Always analyze specs for bottlenecks and ensure the PSU is sufficient for any suggested hardware.
            5. RADAR CONTROL: If the user needs a fresh scan, provide the exact part name they should type into the Radar Control interface.
            6. PERSONALITY: You are technical, precise, objective, and incredibly helpful. Your goal is to save the user's money and solve their tech problems efficiently.`
        });

        const formattedHistory = chatHistory.map(msg => ({
            role: msg.role === 'ai' ? 'model' : 'user',
            parts: [{ text: msg.text }]
        }));

        const chat = model.startChat({ history: formattedHistory });
        
        let result;
        const textPrompt = `Respond in ${lang || 'en'}. User: ${cleanMessage || "Please analyze this image."}`;

        if (image && image.data && image.mimeType) {
            result = await chat.sendMessage([
                textPrompt,
                {
                    inlineData: {
                        data: image.data,
                        mimeType: image.mimeType
                    }
                }
            ]);
        } else {
            result = await chat.sendMessage(textPrompt);
        }

        const aiResponse = result.response.text();

        const histMessage = cleanMessage + (image ? "\n[System: User uploaded an image for analysis]" : "");
        chatHistory.push({ role: 'user', text: histMessage });
        chatHistory.push({ role: 'ai', text: aiResponse });
        
        const transaction = redis.multi();
        transaction.set(userKey, userData);
        transaction.set(chatHistoryKey, chatHistory);

        if (!isPremium) {
            transaction.expire(usageKey, 60 * 60 * 48); 
        }

        await transaction.exec();

        res.status(200).json({ text: aiResponse, chatId: currentChatId });

    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ text: "System overload. Try again later." });
    }
}
