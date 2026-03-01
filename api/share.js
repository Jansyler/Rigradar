import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
    const { id } = req.query;

    if (!id) return res.redirect('/');

    try {
        const promises = [
            redis.lrange('global_history', 0, 50),
            redis.get('latest_deal')
        ];
        const results = await Promise.all(promises);
        
        let foundDeal = null;
        
        const historyRaw = results[0] || [];
        for (const itemStr of historyRaw) {
            try {
                const item = JSON.parse(itemStr);
                if (String(item.id) === String(id)) {
                    foundDeal = item;
                    break;
                }
            } catch(e) {}
        }

        if (!foundDeal && results[1]) {
            try {
                const latest = typeof results[1] === 'string' ? JSON.parse(results[1]) : results[1];
                if (String(latest.id) === String(id)) {
                    foundDeal = latest;
                }
            } catch(e) {}
        }

        if (!foundDeal) {
            return res.redirect('/'); 
        }

        let cleanPrice = foundDeal.price || "---";
        if(cleanPrice.includes(":")) cleanPrice = cleanPrice.split(":")[1].trim();

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>RigRadar Alert: ${foundDeal.title}</title>
            
            <meta property="og:title" content="🚨 RigRadar Alert: ${cleanPrice}">
            <meta property="og:description" content="${foundDeal.title}\nStore: ${foundDeal.store}\nAI Verdict: ${foundDeal.opinion}">
            <meta property="og:image" content="${foundDeal.image || 'https://rigradarai.com/social-preview.png'}">
            <meta property="og:url" content="https://rigradarai.com/api/share?id=${id}">
            
            <meta name="twitter:card" content="summary_large_image">
            <meta name="twitter:title" content="🚨 RigRadar Alert: ${cleanPrice}">
            <meta name="twitter:description" content="${foundDeal.title}\nStore: ${foundDeal.store}">
            <meta name="twitter:image" content="${foundDeal.image || 'https://rigradarai.com/social-preview.png'}">
            
            <meta http-equiv="refresh" content="0; url=/?dealId=${id}">
        </head>
        <body style="background: #050505; color: white; font-family: sans-serif; text-align: center; padding-top: 20vh;">
            <h2>Connecting to Radar...</h2>
            <script>window.location.href = "/?dealId=${id}";</script>
        </body>
        </html>
        `;

        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(html);
        
    } catch (error) {
        console.error("Share Error:", error);
        return res.redirect('/');
    }
}
