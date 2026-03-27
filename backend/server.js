const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
require('dotenv').config();

const scannerRoutes = require('./routes/scanner-routes');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api', scannerRoutes);

// OAuth login redirect - at root level (not under /api/)
app.get('/oauth/login', (req, res) => {
    const kiteApiKey = 'r1a7qo9w30bxsfax';
    const redirectUrl = `https://kite.trade/connect/login?api_key=${kiteApiKey}&v=3`;
    
    console.log('🔐 OAuth login request received');
    console.log('📍 Redirecting to:', redirectUrl);
    console.log('✅ Callback URL: http://localhost:5000/login/callback');
    
    res.redirect(redirectUrl);
});

// OAuth callback handler - at root level
app.get('/login/callback', async (req, res) => {
    console.log('🔄 === OAUTH CALLBACK RECEIVED ===');
    console.log('📥 Query parameters:', req.query);
    
    try {
        const { request_token } = req.query;
        
        if (!request_token) {
            console.error('❌ No request token in callback');
            return res.send(`
                <html>
                    <head><title>Login Error</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
                        <h2 style="color: red;">❌ Login Failed</h2>
                        <p>No request token received from Kite</p>
                        <p style="color: #666;">Please close this window and try again.</p>
                        <script>
                            // Try to communicate error with parent window
                            if (window.opener) {
                                window.opener.postMessage({
                                    type: 'KITE_LOGIN_ERROR',
                                    error: 'No request token received'
                                }, '*');
                            }
                            
                            // Auto-close after 5 seconds
                            setTimeout(() => {
                                window.close();
                            }, 5000);
                        </script>
                    </body>
                </html>
            `);
        }

        console.log('📝 Processing request token:', request_token);
        
        // Generate session to get access token
        const KiteConnect = require('kiteconnect').KiteConnect;
        const kc = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        
        // Replace with your actual API secret
        const session = await kc.generateSession(request_token, 'dg9xa47tsayepnnb2xhdk0vk081cec36');
        const accessToken = session.access_token;
        
        console.log('🔑 Access token generated successfully');
        
        // Return success page with access token
        res.send(`
            <html>
                <head><title>Kite Login Success</title></head>
                <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
                    <h2 style="color: green;">✅ Kite Login Successful!</h2>
                    <p>Access token: <code style="background: #f5f5f5; padding: 4px 8px; border-radius: 4px;">${accessToken}</code></p>
                    <p style="color: #666;">You can close this window and return to the trading scanner.</p>
                    <script>
                        // Store access token in localStorage for the parent window
                        try {
                            localStorage.setItem('kite_access_token', '${accessToken}');
                            localStorage.setItem('kite_login_time', Date.now().toString());
                            
                            // Try to communicate with parent window
                            if (window.opener) {
                                window.opener.postMessage({
                                    type: 'KITE_LOGIN_SUCCESS',
                                    access_token: '${accessToken}'
                                }, '*');
                            }
                            
                            // Auto-close after 3 seconds
                            setTimeout(() => {
                                window.close();
                            }, 3000);
                        } catch (error) {
                            console.error('Error storing token:', error);
                        }
                    </script>
                </body>
            </html>
        `);
        
    } catch (error) {
        console.error('❌ OAuth callback error:', error);
        res.send(`
            <html>
                <head><title>Kite Login Error</title></head>
                <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
                    <h2 style="color: red;">❌ Login Failed</h2>
                    <p>Error: ${error.message}</p>
                    <p style="color: #666;">Please close this window and try again.</p>
                    <script>
                        // Try to communicate error with parent window
                        if (window.opener) {
                            window.opener.postMessage({
                                type: 'KITE_LOGIN_ERROR',
                                error: '${error.message}'
                            }, '*');
                        }
                        
                        // Auto-close after 5 seconds
                        setTimeout(() => {
                            window.close();
                        }, 5000);
                    </script>
                </body>
            </html>
        `);
    }
});

// Check login status route - at root level
app.get('/login/status', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const access_token = token || req.query.access_token;
        
        if (!access_token) {
            return res.json({
                success: false,
                loggedIn: false,
                message: 'No access token provided'
            });
        }
        
        // Validate access token by getting user profile
        const KiteConnect = require('kiteconnect').KiteConnect;
        const kite = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kite.setAccessToken(access_token);
        
        const profile = await kite.getProfile();
        
        res.json({
            success: true,
            loggedIn: true,
            user: {
                user_id: profile.user_id,
                user_name: profile.user_name,
                email: profile.email,
                broker: profile.broker
            },
            message: 'Access token is valid'
        });
        
    } catch (error) {
        console.error('❌ Login status check error:', error);
        res.json({
            success: false,
            loggedIn: false,
            error: error.message,
            message: 'Invalid or expired access token'
        });
    }
});

// Routes
app.use('/api', scannerRoutes);

// WebSocket connection handling
const connectedClients = new Set();

wss.on('connection', (ws) => {
    console.log('New WebSocket client connected');
    connectedClients.add(ws);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received:', data);
            
            // Handle different message types
            if (data.type === 'subscribe') {
                ws.symbol = data.symbol;
                ws.send(JSON.stringify({ type: 'subscribed', symbol: data.symbol }));
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        connectedClients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        connectedClients.delete(ws);
    });
});

// Global function to broadcast live data
global.broadcastLiveData = (data) => {
    const message = JSON.stringify(data);
    connectedClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
};

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        clients: connectedClients.size 
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Trading Scanner Server running on port ${PORT}`);
    console.log(`📊 WebSocket server ready for connections`);
    console.log(`🔗 Connect at: ws://localhost:${PORT}`);
});

module.exports = { app, server, wss };