const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
// Use Passenger/cPanel provided port if present
const PORT = process.env.PORT || 3000;
// Optional envs for shared hosting and remote Chromium
const PUPPETEER_WS_ENDPOINT = process.env.PUPPETEER_WS_ENDPOINT || process.env.BROWSER_WS_ENDPOINT || null;
const PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || null;
const WA_SESSION_PATH = process.env.WA_SESSION_PATH || './session';
const DEFAULT_PPTR_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu'
];

const HELPDESK_ENABLED = process.env.HELPDESK_ENABLED === 'true';
const HELPDESK_CONNECTION_ID = process.env.HELPDESK_CONNECTION_ID || null;
const HELPDESK_API_URL = process.env.HELPDESK_API_URL || null;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Multiple WhatsApp Clients Storage
const clients = new Map(); // connectionId -> { client, metadata }

// Connection metadata structure:
// {
//   id: string,
//   name: string,
//   status: 'initializing' | 'qr_ready' | 'connected' | 'disconnected' | 'error',
//   qrCode: string | null,
//   qrImage: string | null,
//   info: object | null (pushname, phone, platform),
//   createdAt: timestamp,
//   connectedAt: timestamp | null
// }

// Initialize WhatsApp Client for a specific connection
function initializeClient(connectionId, connectionName) {
    console.log(`🚀 Initializing connection: ${connectionName} (${connectionId})`);
    
    // Check if connection already exists
    if (clients.has(connectionId)) {
        console.log(`⚠️  Connection ${connectionId} already exists`);
        return { success: false, error: 'Connection already exists' };
    }

    const metadata = {
        id: connectionId,
        name: connectionName,
        status: 'initializing',
        qrCode: null,
        qrImage: null,
        lastQrCode: null,
        info: null,
        lastError: null,
        hasAuthenticated: false,
        hasReady: false,
        createdAt: new Date().toISOString(),
        connectedAt: null
    };

    // Build puppeteer options depending on environment
    const puppeteerOptions = PUPPETEER_WS_ENDPOINT
        ? { browserWSEndpoint: PUPPETEER_WS_ENDPOINT }
        : {
            headless: true,
            args: DEFAULT_PPTR_ARGS,
            executablePath: PUPPETEER_EXECUTABLE_PATH || undefined
        };

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: connectionId,
            dataPath: WA_SESSION_PATH
        }),
        puppeteer: puppeteerOptions
    });

    async function destroyAndRemoveClient(reason) {
        const current = clients.get(connectionId);
        if (!current || current.client !== client) {
            return;
        }

        try {
            metadata.status = 'disconnected';
            metadata.info = null;
            metadata.qrCode = null;
            metadata.qrImage = null;
            metadata.lastQrCode = null;
            metadata.lastError = reason ? String(reason) : null;
            metadata.hasAuthenticated = false;
            metadata.hasReady = false;

            await client.destroy();
        } catch (err) {
            console.error(`❌ [${connectionName}] Error during destroy:`, err);
        } finally {
            clients.delete(connectionId);
        }
    }

    // Event: QR Code received
    client.on('qr', async (qr) => {
        if (metadata.status === 'connected') {
            return;
        }

        if (metadata.lastQrCode && metadata.lastQrCode === qr) {
            return;
        }

        console.log(`📱 [${connectionName}] QR Code received!`);
        metadata.qrCode = qr;
        metadata.lastQrCode = qr;
        metadata.status = 'qr_ready';
        
        try {
            const qrImage = await QRCode.toDataURL(qr);
            metadata.qrImage = qrImage;
            console.log(`✅ [${connectionName}] QR Code generated`);
        } catch (err) {
            console.error(`❌ [${connectionName}] Error generating QR:`, err);
        }
    });

    // Event: Client ready
    client.on('ready', async () => {
        if (metadata.hasReady) {
            return;
        }
        metadata.hasReady = true;
        console.log(`✅ [${connectionName}] WhatsApp Client is ready!`);
        metadata.status = 'connected';
        metadata.qrCode = null;
        metadata.qrImage = null;
        metadata.lastQrCode = null;
        metadata.connectedAt = new Date().toISOString();
        
        try {
            const info = await client.info;
            metadata.info = {
                pushname: info.pushname,
                phone: info.wid.user,
                platform: info.platform
            };
            console.log(`📱 [${connectionName}] Connected as:`, info.pushname);
        } catch (err) {
            console.error(`❌ [${connectionName}] Error getting info:`, err);
        }
    });

    // Event: Authentication success
    client.on('authenticated', () => {
        if (metadata.hasAuthenticated) {
            return;
        }
        metadata.hasAuthenticated = true;
        console.log(`🔐 [${connectionName}] Authentication successful!`);
    });

    // Event: Authentication failure
    client.on('auth_failure', (msg) => {
        console.error(`❌ [${connectionName}] Authentication failed:`, msg);
        metadata.status = 'error';
        metadata.qrCode = null;
        metadata.qrImage = null;
        metadata.lastError = typeof msg === 'string' ? msg : (msg?.message || 'auth_failure');

        // Force a clean slate so the dashboard can recreate the connection.
        destroyAndRemoveClient(metadata.lastError);
    });

    // Event: Disconnected
    client.on('disconnected', (reason) => {
        console.log(`⚠️  [${connectionName}] Client disconnected:`, reason);

        // Keep the client instance in-memory for transient disconnects.
        // Only a user-initiated delete/logout should fully destroy session.
        metadata.status = 'disconnected';
        metadata.info = null;
        metadata.qrCode = null;
        metadata.qrImage = null;
        metadata.lastQrCode = null;
        metadata.lastError = reason ? String(reason) : null;
        metadata.hasAuthenticated = false;
        metadata.hasReady = false;
    });

    // Event: Message received
    client.on('message', async (msg) => {
        console.log(`📨 [${connectionName}] Message from ${msg.from}`);

        // Only process incoming messages (ignore messages sent by this account)
        if (msg.fromMe) {
            return;
        }

        try {
            if (!HELPDESK_ENABLED) {
                console.log(`ℹ️  [${connectionName}] Helpdesk disabled (HELPDESK_ENABLED=${HELPDESK_ENABLED})`);
                return;
            }

            if (!HELPDESK_API_URL) {
                console.error(`❌ [${connectionName}] Helpdesk enabled but HELPDESK_API_URL is missing`);
                return;
            }

            // If HELPDESK_CONNECTION_ID is set, restrict helpdesk to that
            if (HELPDESK_CONNECTION_ID && String(connectionId) !== String(HELPDESK_CONNECTION_ID)) {
                return;
            }

            const from = msg.from || '';

            // Only handle direct 1:1 chats (ignore groups, channels, status, etc.)
            if (!from.endsWith('@c.us')) {
                console.log(`ℹ️  [${connectionName}] Ignoring non-direct chat: ${from}`);
                return;
            }

            const body = msg.body || '';
            const timestamp = msg.timestamp || Math.floor(Date.now() / 1000);
            const waMessageId = msg.id && msg.id.id ? msg.id.id : null;

            // Try to resolve WhatsApp display name for this number
            let fromName = null;
            try {
                const contact = await msg.getContact();
                if (contact) {
                    fromName = contact.pushname || contact.name || contact.shortName || contact.number || null;
                }
            } catch (contactErr) {
                console.error(`⚠️  [${connectionName}] Could not resolve contact name for ${from}`, contactErr);
            }

            // Basic media + reply metadata (no media download here)
            const hasMedia = Boolean(msg.hasMedia);
            const mediaType = hasMedia ? (msg.type || null) : null;

            let quotedId = null;
            try {
                if (msg.hasQuotedMsg) {
                    const quoted = await msg.getQuotedMessage();
                    if (quoted && quoted.id && quoted.id.id) {
                        quotedId = quoted.id.id;
                    }
                }
            } catch (quoteErr) {
                console.error(`⚠️  [${connectionName}] Could not resolve quoted message for ${from}`, quoteErr);
            }

            const payload = {
                connection_id: connectionId,
                from_number: from,
                from_name: fromName,
                body,
                timestamp,
                whatsapp_message_id: waMessageId,
                has_media: hasMedia,
                media_type: mediaType,
                quoted_whatsapp_message_id: quotedId
            };

            const response = await fetch(HELPDESK_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const httpStatus = response.status;

            if (httpStatus < 200 || httpStatus >= 300) {
                console.error(`❌ [${connectionName}] Helpdesk API HTTP ${httpStatus}`);
                return;
            }

            let result;
            try {
                result = await response.json();
            } catch (e) {
                console.error(`❌ [${connectionName}] Helpdesk API invalid JSON`, e);
                return;
            }

            if (!result || result.ok !== true || !Array.isArray(result.actions)) {
                return;
            }

            for (const action of result.actions) {
                if (!action || !action.type || !action.to) {
                    continue;
                }

                let chatId = String(action.to).replace(/\D/g, '');
                if (!chatId.endsWith('@c.us') && !chatId.endsWith('@g.us')) {
                    chatId = chatId + '@c.us';
                }

                try {
                    if (action.type === 'send') {
                        if (!action.body) {
                            continue;
                        }
                        await client.sendMessage(chatId, String(action.body));
                        console.log(`➡️ [${connectionName}] Helpdesk sent message to ${chatId}`);
                    } else if (action.type === 'forward_original') {
                        await msg.forward(chatId);
                        console.log(`➡️ [${connectionName}] Helpdesk forwarded original message to ${chatId}`);
                    } else {
                        // Unknown action type; ignore
                        continue;
                    }
                } catch (sendErr) {
                    console.error(`❌ [${connectionName}] Error sending helpdesk action to ${chatId}`, sendErr);
                }
            }
        } catch (err) {
            console.error(`❌ [${connectionName}] Helpdesk routing error`, err);
        }
    });

    // Store client and metadata
    clients.set(connectionId, { client, metadata });

    // Initialize client
    client.initialize().catch(err => {
        console.error(`❌ [${connectionName}] Error initializing:`, err);
        metadata.status = 'error';
        metadata.lastError = err?.message || String(err);
        destroyAndRemoveClient(metadata.lastError);
    });

    return { success: true, metadata };
}

// Helper: Get client by ID
function getClient(connectionId) {
    const connection = clients.get(connectionId);
    if (!connection) {
        return { success: false, error: 'Connection not found' };
    }
    return { success: true, ...connection };
}

// Helper: Delete connection
async function deleteConnection(connectionId) {
    const connection = clients.get(connectionId);
    if (!connection) {
        return { success: false, error: 'Connection not found' };
    }

    try {
        await connection.client.destroy();
        clients.delete(connectionId);
        console.log(`🗑️  Connection ${connectionId} deleted`);
        return { success: true };
    } catch (err) {
        console.error(`Error deleting connection ${connectionId}:`, err);
        return { success: false, error: err.message };
    }
}

// ==================== API ENDPOINTS ====================

// Health check
app.get('/', (req, res) => {
    const connections = Array.from(clients.values()).map(c => ({
        id: c.metadata.id,
        name: c.metadata.name,
        status: c.metadata.status
    }));
    
    res.json({
        status: 'running',
        server_version: '2.0.0',
        total_connections: clients.size,
        connections
    });
});

// Backward-compatible status endpoint
app.get('/api/status', (req, res) => {
    const connections = Array.from(clients.values()).map(c => ({
        id: c.metadata.id,
        name: c.metadata.name,
        status: c.metadata.status
    }));
    res.json({
        status: 'running',
        server_version: '2.0.0',
        total_connections: clients.size,
        connections
    });
});

// ==================== CONNECTION MANAGEMENT ====================

// Create new connection
app.post('/api/connections', (req, res) => {
    const { id, name } = req.body;
    
    if (!id || !name) {
        return res.status(400).json({
            success: false,
            error: 'id and name are required'
        });
    }
    
    const result = initializeClient(id, name);
    
    if (!result.success) {
        return res.status(400).json(result);
    }
    
    res.json({
        success: true,
        message: 'Connection created successfully',
        connection: result.metadata
    });
});

// List all connections
app.get('/api/connections', (req, res) => {
    const connections = Array.from(clients.values()).map(c => c.metadata);
    res.json({
        success: true,
        total: connections.length,
        connections
    });
});

// Get specific connection status
app.get('/api/connections/:id', (req, res) => {
    const { id } = req.params;
    const result = getClient(id);
    
    if (!result.success) {
        return res.status(404).json(result);
    }
    
    res.json({
        success: true,
        connection: result.metadata
    });
});

// Get QR code for specific connection
app.get('/api/connections/:id/qr', (req, res) => {
    const { id } = req.params;
    const result = getClient(id);
    
    if (!result.success) {
        return res.status(404).json(result);
    }
    
    const { metadata } = result;
    
    if (metadata.status === 'connected') {
        return res.json({
            success: false,
            error: 'Already authenticated',
            status: 'connected'
        });
    }
    
    if (!metadata.qrCode) {
        return res.json({
            success: false,
            error: 'QR code not available yet',
            status: metadata.status
        });
    }
    
    res.json({
        success: true,
        qr: metadata.qrCode,
        qr_image: metadata.qrImage,
        status: metadata.status
    });
});

// Delete connection
app.delete('/api/connections/:id', async (req, res) => {
    const { id } = req.params;
    const result = await deleteConnection(id);
    
    if (!result.success) {
        return res.status(404).json(result);
    }
    
    res.json({
        success: true,
        message: 'Connection deleted successfully'
    });
});

// Restart connection
app.post('/api/connections/:id/restart', async (req, res) => {
    const { id } = req.params;
    const result = getClient(id);
    
    if (!result.success) {
        return res.status(404).json(result);
    }
    
    try {
        const name = result.metadata.name;
        await deleteConnection(id);
        
        setTimeout(() => {
            initializeClient(id, name);
        }, 2000);
        
        res.json({
            success: true,
            message: 'Connection restarting...'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Logout/disconnect specific connection
app.post('/api/connections/:id/logout', async (req, res) => {
    const { id } = req.params;
    const result = getClient(id);
    
    if (!result.success) {
        return res.status(404).json(result);
    }
    
    try {
        await result.client.logout();
        result.metadata.status = 'disconnected';
        result.metadata.info = null;
        
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== MESSAGING ====================

// Send text message via specific connection
app.post('/api/send', async (req, res) => {
    const { connectionId, receiver, message, isGroup } = req.body;

    // Support legacy single-client mode (use first connection if no connectionId)
    let targetConnectionId = connectionId;
    if (!targetConnectionId && clients.size === 1) {
        targetConnectionId = Array.from(clients.keys())[0];
    }

    if (!targetConnectionId) {
        return res.status(400).json({ 
            success: false, 
            error: 'connectionId is required for multi-connection mode' 
        });
    }

    const result = getClient(targetConnectionId);
    if (!result.success) {
        return res.status(404).json(result);
    }

    if (result.metadata.status !== 'connected') {
        return res.status(503).json({ 
            success: false, 
            error: `Connection ${targetConnectionId} is not ready. Current status: ${result.metadata.status}` 
        });
    }

    if (!receiver || !message) {
        return res.status(400).json({ 
            success: false, 
            error: 'receiver and message are required' 
        });
    }

    try {
        // Format phone number
        let chatId = receiver;
        if (!isGroup) {
            // Remove any non-digit characters
            chatId = receiver.replace(/\D/g, '');
            // Add @c.us for individual chats
            if (!chatId.endsWith('@c.us')) {
                chatId = chatId + '@c.us';
            }
        } else {
            // For groups, ensure it has @g.us
            if (!chatId.endsWith('@g.us')) {
                chatId = chatId + '@g.us';
            }
        }

        // Send message
        const sentMessage = await result.client.sendMessage(chatId, message);
        
        res.json({
            success: true,
            message_id: sentMessage.id.id,
            timestamp: sentMessage.timestamp,
            to: chatId,
            connection: result.metadata.name
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send message'
        });
    }
});

// Send file/media via specific connection
app.post('/api/send-file', async (req, res) => {
    const { connectionId, receiver, fileUrl, caption, isGroup } = req.body;

    // Support legacy single-client mode
    let targetConnectionId = connectionId;
    if (!targetConnectionId && clients.size === 1) {
        targetConnectionId = Array.from(clients.keys())[0];
    }

    if (!targetConnectionId) {
        return res.status(400).json({ 
            success: false, 
            error: 'connectionId is required for multi-connection mode' 
        });
    }

    const result = getClient(targetConnectionId);
    if (!result.success) {
        return res.status(404).json(result);
    }

    if (result.metadata.status !== 'connected') {
        return res.status(503).json({ 
            success: false, 
            error: `Connection ${targetConnectionId} is not ready. Current status: ${result.metadata.status}` 
        });
    }

    if (!receiver || !fileUrl) {
        return res.status(400).json({ 
            success: false, 
            error: 'receiver and fileUrl are required' 
        });
    }

    try {
        // Format phone number
        let chatId = receiver;
        if (!isGroup) {
            chatId = receiver.replace(/\D/g, '');
            if (!chatId.endsWith('@c.us')) {
                chatId = chatId + '@c.us';
            }
        } else {
            if (!chatId.endsWith('@g.us')) {
                chatId = chatId + '@g.us';
            }
        }

        // Download and send media
        const media = await MessageMedia.fromUrl(fileUrl);
        const sentMessage = await result.client.sendMessage(chatId, media, { 
            caption: caption || '' 
        });
        
        res.json({
            success: true,
            message_id: sentMessage.id.id,
            timestamp: sentMessage.timestamp,
            to: chatId,
            connection: result.metadata.name
        });
    } catch (error) {
        console.error('Error sending file:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send file'
        });
    }
});

// Start Express server
app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   QuickSend WhatsApp Server v2.0 (Multi-WA)  ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log('');
    console.log(`🌐 Server: http://localhost:${PORT}`);
    console.log(`📱 Connections: http://localhost:${PORT}/api/connections`);
    console.log(`➕ Create: POST http://localhost:${PORT}/api/connections`);
    console.log('');
    console.log('✨ Multi-Connection Mode Enabled');
    console.log('📝 Use dashboard to create and manage WhatsApp connections');
    if (PUPPETEER_WS_ENDPOINT) {
        console.log('🔗 Using remote Chromium via PUPPETEER_WS_ENDPOINT');
    } else if (PUPPETEER_EXECUTABLE_PATH) {
        console.log('🛠 Using custom Chromium executable path');
    } else {
        console.log('⚠️  Using local Chromium (may not work on shared cPanel)');
    }
    console.log('');
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n⚠️  Shutting down gracefully...');
    console.log(`Closing ${clients.size} connection(s)...`);
    
    for (const [id, connection] of clients.entries()) {
        try {
            await connection.client.destroy();
            console.log(`✅ Closed connection: ${connection.metadata.name}`);
        } catch (err) {
            console.error(`❌ Error closing ${id}:`, err.message);
        }
    }
    
    console.log('👋 Shutdown complete');
    process.exit(0);
});

// Prevent crashes on unhandled promise rejections
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});
