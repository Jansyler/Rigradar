export default function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    res.setHeader(
        'Set-Cookie', 
        'rr_auth_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    );
    
    return res.status(200).json({ message: 'Logged out successfully' });
}
