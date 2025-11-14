# QuickSend WhatsApp Server

## 📱 **Standalone WhatsApp Integration** 

This is a **free, local WhatsApp server** powered by **whatsapp-web.js** that allows your QuickSend dashboard to send WhatsApp messages without any third-party API.

---

## ✨ **Features**

- ✅ **100% Free** - No monthly fees or per-message costs
- ✅ **Send to Individuals** - Direct messages to any phone number
- ✅ **Send to Groups** - Message WhatsApp groups
- ✅ **Send Files** - Images, PDFs, documents (up to 64MB)
- ✅ **Add Captions** - Text with files
- ✅ **QR Code Auth** - Easy one-time setup
- ✅ **Persistent Sessions** - Stay connected even after restart
- ✅ **REST API** - Simple HTTP endpoints

---

## 📋 **Requirements**

1. **Node.js** (v16 or higher)
   - Download: https://nodejs.org/
   - Verify: Run `node --version` in Command Prompt

2. **WhatsApp Account**
   - Personal or Business WhatsApp
   - Phone must have internet connection

3. **XAMPP/Apache** running your QuickSend dashboard

---

## 🚀 **Installation**

### **Step 1: Install Node.js Dependencies**

1. Open Command Prompt
2. Navigate to this folder:
   ```bash
   cd C:\xampp\htdocs\quicksend\whatsapp-server
   ```

3. Run the installer:
   ```bash
   install.bat
   ```
   
   OR manually:
   ```bash
   npm install
   ```

This will install:
- `whatsapp-web.js` - WhatsApp Web API
- `express` - HTTP server
- `qrcode` - QR code generation
- Other dependencies

---

## 🎯 **Usage**

### **Step 1: Start the Server**

**Option A: Double-click**
- Double-click `start.bat`
- A command window will open

**Option B: Command line**
```bash
cd C:\xampp\htdocs\quicksend\whatsapp-server
npm start
```

You should see:
```
╔════════════════════════════════════════╗
║   QuickSend WhatsApp Server Running   ║
╚════════════════════════════════════════╝

🌐 Server: http://localhost:3000
📱 Status: http://localhost:3000/api/status
📷 QR Code: http://localhost:3000/api/qr

Waiting for WhatsApp connection...
```

### **Step 2: Connect WhatsApp**

1. **Open your browser** and go to your QuickSend dashboard
2. **Login as Admin**
3. **Navigate to:** Admin → WhatsApp Connection
4. **You'll see a QR code** (if server is running)
5. **Open WhatsApp on your phone**
6. **Go to:** Settings → Linked Devices → Link a Device
7. **Scan the QR code** displayed on screen
8. **Wait for confirmation** - Status will change to "Connected"

### **Step 3: Send Messages**

Once connected:
1. Go to **Admin → Send WhatsApp**
2. Select a client
3. Enter receiver phone number (e.g., `94773218799`)
4. Enter your message
5. Click **Send WhatsApp**

---

## 🔌 **API Endpoints**

The server provides these REST API endpoints:

### **GET /** 
Health check and server status

### **GET /api/status**
Get connection status
```json
{
  "ready": true,
  "qr_available": false,
  "info": {
    "pushname": "Your Name",
    "wid": {
      "user": "94773218799"
    }
  }
}
```

### **GET /api/qr**
Get QR code for authentication
```json
{
  "qr": "2@...",
  "qr_image": "data:image/png;base64,..."
}
```

### **POST /api/send**
Send text message
```json
{
  "receiver": "94773218799",
  "message": "Hello from QuickSend!",
  "isGroup": false
}
```

### **POST /api/send-file**
Send file with optional caption
```json
{
  "receiver": "94773218799",
  "fileUrl": "https://example.com/file.pdf",
  "caption": "Check this file",
  "isGroup": false
}
```

### **POST /api/logout**
Disconnect WhatsApp

### **POST /api/restart**
Restart the WhatsApp client

---

## 📁 **File Structure**

```
whatsapp-server/
├── server.js           # Main server file
├── package.json        # Node.js dependencies
├── start.bat          # Start script (Windows)
├── install.bat        # Installation script
├── README.md          # This file
├── session/           # Session data (auto-created)
│   └── (WhatsApp auth files)
├── qr-code.txt        # Last QR code (text)
└── qr-code-image.txt  # Last QR code (base64 image)
```

---

## 🔧 **Configuration**

The PHP dashboard is configured to use this server via `config.php`:

```php
define('WA_API_BASE_URL', 'http://localhost:3000/api');
define('WA_API_TYPE', 'local');
define('WA_COST_PER_MESSAGE', 0.00); // Free!
```

---

## ⚠️ **Important Notes**

### **Keep Server Running**
- The server must be running to send/receive messages
- Close the server window = disconnect WhatsApp
- Consider running as a Windows Service for production

### **Session Persistence**
- Session is saved in `session/` folder
- After first QR scan, no need to scan again
- Delete `session/` folder to reset connection

### **Phone Requirements**
- Your phone must have internet
- WhatsApp app must be installed
- Can link up to 4 devices to one WhatsApp account

### **Rate Limits**
- WhatsApp may block if you send too many messages too fast
- Recommended: Max 100-200 messages per hour
- Use delays between bulk messages

---

## 🐛 **Troubleshooting**

### **"Server not running" error**
- **Solution:** Start the server with `start.bat`
- **Check:** Visit `http://localhost:3000` in browser

### **QR Code not appearing**
- **Wait 10-30 seconds** for server to initialize
- **Restart server** if stuck
- **Check console** for error messages

### **"WhatsApp client not ready"**
- **Scan QR code** first
- **Wait for "Connected" status**
- **Check phone internet** connection

### **Messages not sending**
- **Phone number format:** Use country code (94773218799)
- **No spaces or dashes**
- **Check WhatsApp connection** status
- **Verify receiver number** is on WhatsApp

### **Session expired**
- **Delete `session/` folder**
- **Restart server**
- **Scan QR code again**

### **Port 3000 already in use**
- **Close other Node.js apps**
- **Or change port** in `server.js` (line 6)

---

## 🔒 **Security**

- ✅ Server runs locally (not exposed to internet)
- ✅ Session encrypted by WhatsApp
- ✅ No data sent to third parties
- ⚠️ Don't share `session/` folder
- ⚠️ Use firewall if exposing to network

---

## 📊 **Performance**

- **Startup time:** 10-30 seconds
- **Message send time:** 1-3 seconds
- **Memory usage:** ~100-200 MB
- **CPU usage:** Very low when idle

---

## 🚀 **Production Deployment**

For production use:

1. **Use PM2** for process management:
   ```bash
   npm install -g pm2
   pm2 start server.js --name whatsapp-server
   pm2 startup
   pm2 save
   ```

2. **Use NSSM** to run as Windows Service:
   - Download NSSM: https://nssm.cc/
   - Install service:
     ```bash
     nssm install WhatsAppServer "C:\Program Files\nodejs\node.exe" "C:\xampp\htdocs\quicksend\whatsapp-server\server.js"
     ```

3. **Add monitoring** for auto-restart on crashes

---

## 📝 **License**

This server uses **whatsapp-web.js** which is licensed under Apache 2.0.

**Note:** This is an unofficial WhatsApp API. Use at your own risk. WhatsApp may ban accounts that violate their Terms of Service.

---

## 🆘 **Support**

For issues:
1. Check the troubleshooting section above
2. Check server console for error messages
3. Verify Node.js and npm are installed
4. Ensure WhatsApp Web works in your browser

---

## 🎉 **Success!**

If you see "Connected" status in the dashboard, you're ready to send WhatsApp messages for free! 🚀

**Happy messaging!** 📱
