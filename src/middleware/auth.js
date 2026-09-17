export function authenticateInternalRequest(req, res, next) {
    const auth = req.headers.authorization || '';

    const expected = `Bearer ${process.env.SERVER_AUTH_KEY}`;

    if (!process.env.SERVER_AUTH_KEY) {
        console.error('SERVER_AUTH_KEY is not configured');

        return res.status(500).json({
            error: 'Internal authentication is not configured'
        });
    }

    if (auth !== expected) {
        return res.status(401).json({
            error: 'Unauthorized'
        });
    }

    next();
}
