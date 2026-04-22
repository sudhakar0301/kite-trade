// Test server to check for basic startup issues
const express = require('express');
const cors = require('cors');
require('dotenv').config();

console.log('Starting test server...');

try {
    const app = express();
    
    // Basic middleware
    app.use(cors());
    app.use(express.json());
    
    // Test route
    app.get('/api/test', (req, res) => {
        res.json({ 
            success: true, 
            message: 'Test server is working',
            timestamp: new Date().toISOString()
        });
    });
    
    // Test buy-order route with minimal logic
    app.post('/api/buy-order', (req, res) => {
        console.log('Test buy-order route hit');
        res.json({
            success: false,
            error: 'Test server - buy-order endpoint is working',
            timestamp: new Date().toISOString()
        });
    });
    
    const PORT = process.env.PORT || 5000;
    
    app.listen(PORT, () => {
        console.log(`✅ Test server running on port ${PORT}`);
        console.log(`✅ Test endpoint: http://localhost:${PORT}/api/test`);
        console.log(`✅ Buy-order endpoint: http://localhost:${PORT}/api/buy-order`);
    });
    
} catch (error) {
    console.error('❌ Test server startup error:', error);
    process.exit(1);
}