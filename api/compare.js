import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    
    const { hw1, hw2, context } = req.body;
    if (!hw1 || !hw2) return res.status(400).json({ error: "Missing components" });

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const contextStr = context ? `The user explicitly stated this use-case: "${context}". Evaluate heavily based on this.` : "Evaluate for general modern PC usage (gaming/productivity).";

    const prompt = `
    You are an elite PC hardware expert. Compare these two components: ${hw1} vs ${hw2}.
    They can be GPUs, CPUs, Motherboards, RAM, etc. Figure out what they are.
    
    ${contextStr}

    Return ONLY a raw JSON object (absolutely no markdown tags like \`\`\`json) with this exact structure:
    {
      "hw1": { 
        "name": "Clean Product Name", 
        "keySpecs": "Short string of main specs (e.g. 16GB VRAM, 250W or 8-Core, 5.0GHz)", 
        "avgPrice": "Estimated avg used/new market price in USD", 
        "pros": ["Pro 1", "Pro 2"],
        "cons": ["Con 1", "Con 2"],
        "score": 0-100 (Based on performance and value for the user's context)
      },
      "hw2": { 
        "name": "Clean Product Name", 
        "keySpecs": "Short string of main specs", 
        "avgPrice": "Estimated avg used/new market price in USD", 
        "pros": ["Pro 1", "Pro 2"],
        "cons": ["Con 1", "Con 2"],
        "score": 0-100
      },
      "verdict": "A 3-4 sentence detailed verdict. Mention potential bottlenecks if they are paired with mismatched parts. Be critical and objective."
    }`;

    try {
        const result = await model.generateContent(prompt);
        let text = result.response.text().trim();
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();
        
        res.status(200).json(JSON.parse(text));
    } catch (error) {
        console.error("Compare Error:", error);
        res.status(500).json({ error: "Comparison failed" });
    }
}
