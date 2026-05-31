const express = require('express');
const app = express();
const path = require('path');
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// הגשת קבצים סטטיים (HTML, CSS, JS) מהתיקייה הנוכחית
app.use(express.static(__dirname));

// ניתוב דף הבית שיציג את קובץ ה-index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// לוגיקת ה-Socket.io לתקשורת בזמן אמת
io.on('connection', (socket) => {
    console.log('משתמש התחבר:', socket.id);

    // האזנה לקבלת הודעה חדשה והפצתה לכולם
    socket.on('sendMessage', (data) => {
        io.emit('receiveMessage', data);
    });

    socket.on('disconnect', () => {
        console.log('משתמש התנתק:', socket.id);
    });
});

// שימוש בפורט של Render או ב-3000 כמקומיי
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`השרת פעיל ומוכן בפורט ${PORT}`);
});