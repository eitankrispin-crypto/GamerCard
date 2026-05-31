const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const users = {}; 
const roomMessages = {}; 

const roomsData = {
    'הלובי המרכזי': { owner: 'system', isPublic: true, allowed: [] }
};

io.on('connection', (socket) => {
    
    // קבלת נתוני השחקן כולל תמונת פרופיל
    socket.on('register', (data, callback) => {
        let assignedId = data.savedId;
        const name = data.name;
        const pic = data.pic; 
        
        if ((name === 'GAMERTAG' || assignedId === 'GMR-4358') && (!assignedId || assignedId === 'GMR-4358')) {
            const existingUser = Object.values(users).find(u => u.id === 'GMR-4358');
            if (existingUser) {
                const oldSocket = io.sockets.sockets.get(existingUser.socketId);
                if (oldSocket) oldSocket.disconnect();
                delete users[existingUser.socketId];
            }
            assignedId = 'GMR-4358'; 
        } else if (!assignedId) {
            do {
                assignedId = 'GMR-' + Math.floor(1000 + Math.random() * 9000);
            } while (Object.values(users).some(u => u.id === assignedId) || assignedId === 'GMR-4358');
        }
        
        users[socket.id] = { name: name, id: assignedId, socketId: socket.id, pic: pic };
        socket.username = name;
        socket.gmrId = assignedId;
        socket.profilePic = pic;
        
        console.log(`משתמש מחובר: ${name} (ID: ${assignedId})`);
        
        const myRooms = Object.keys(roomsData).filter(r => 
            roomsData[r].isPublic || 
            roomsData[r].allowed.includes(assignedId) || 
            roomsData[r].owner === assignedId ||
            assignedId === 'GMR-4358'
        ).map(r => ({
            name: r,
            isOwner: (roomsData[r].owner === assignedId || assignedId === 'GMR-4358')
        }));

        callback({ success: true, id: assignedId, rooms: myRooms });
    });

    socket.on('change_name', (newName) => {
        if (users[socket.id]) users[socket.id].name = newName;
        socket.username = newName;
    });

    socket.on('change_pic', (newPic) => {
        if (users[socket.id]) users[socket.id].pic = newPic;
        socket.profilePic = newPic;
    });

    socket.on('create_room', (roomName) => {
        if(!roomsData[roomName]) {
            roomsData[roomName] = { owner: socket.gmrId, isPublic: false, allowed: [socket.gmrId] };
            roomMessages[roomName] = [];
        }
    });

    socket.on('invite_user', (data) => {
        const { room, guestId } = data;
        if (room === 'הלובי המרכזי') return; 

        const roomInfo = roomsData[room];
        if (roomInfo && (roomInfo.owner === socket.gmrId || socket.gmrId === 'GMR-4358')) {
            if (!roomInfo.allowed.includes(guestId)) {
                roomInfo.allowed.push(guestId);
            }
            const guestUser = Object.values(users).find(u => u.id === guestId);
            if (guestUser) {
                io.to(guestUser.socketId).emit('room_invite', { roomName: room, from: socket.username });
            }
        }
    });

    // ==========================================
    // מערכת החברים - שליחה וקבלת אישור חברות
    // ==========================================
    socket.on('send_friend_request', (targetId, callback) => {
        if (!socket.gmrId) {
            return callback({ success: false, msg: 'אינך מחובר למערכת!' });
        }
        if (targetId === socket.gmrId) {
            return callback({ success: false, msg: 'אתה לא יכול להוסיף את עצמך לחברים!' });
        }
        
        const targetUser = Object.values(users).find(u => u.id === targetId);
        if (targetUser) {
            io.to(targetUser.socketId).emit('receive_friend_request', {
                fromId: socket.gmrId,
                fromName: socket.username
            });
            callback({ success: true, msg: 'נשלח בהצלחה!' });
        } else {
            callback({ success: false, msg: 'המשתמש שחיפשת לא מחובר כרגע או שה-ID שגוי.' });
        }
    });

    socket.on('accept_friend_request', (requesterId) => {
        const requesterUser = Object.values(users).find(u => u.id === requesterId);
        if (requesterUser) {
            io.to(requesterUser.socketId).emit('friend_added', {
                id: socket.gmrId,
                name: socket.username
            });
            socket.emit('friend_added', {
                id: requesterId,
                name: requesterUser.name
            });
        }
    });
    // ==========================================

    socket.on('join_room', (room) => {
        socket.join(room);
        if (!roomMessages[room]) roomMessages[room] = [];
        socket.emit('load_history', roomMessages[room]);
    });

    socket.on('delete_room', (roomName) => {
        if (roomName === 'הלובי המרכזי') return; 

        const roomInfo = roomsData[roomName];
        if (roomInfo && (roomInfo.owner === socket.gmrId || socket.gmrId === 'GMR-4358')) {
            delete roomsData[roomName];
            delete roomMessages[roomName];
            io.emit('room_deleted', roomName); 
        }
    });

    socket.on('rename_room', (data) => {
        if (data.oldName === 'הלובי המרכזי') return; 

        const roomInfo = roomsData[data.oldName];
        if (roomInfo && (roomInfo.owner === socket.gmrId || socket.gmrId === 'GMR-4358')) {
            roomsData[data.newName] = roomsData[data.oldName];
            delete roomsData[data.oldName];
            
            roomMessages[data.newName] = roomMessages[data.oldName] || [];
            delete roomMessages[data.oldName];

            io.emit('room_renamed', data);
        }
    });

    socket.on('send_message', (data) => {
        const messageId = 'msg-' + Date.now() + '-' + Math.round(Math.random() * 10000);
        const messageObj = { 
            msgId: messageId, 
            from: socket.username, 
            id: socket.gmrId, 
            pic: socket.profilePic, 
            text: data.text 
        };

        if (!roomMessages[data.room]) roomMessages[data.room] = [];
        roomMessages[data.room].push(messageObj);
        if (roomMessages[data.room].length > 150) roomMessages[data.room].shift();

        io.to(data.room).emit('receive_message', messageObj);
    });

    socket.on('delete_message', (data) => {
        if (roomMessages[data.room]) {
            roomMessages[data.room] = roomMessages[data.room].filter(msg => msg.msgId !== data.msgId);
            io.to(data.room).emit('message_deleted', data.msgId);
        }
    });

    socket.on('go_live', () => socket.broadcast.emit('live_alert', { from: socket.username }));

    socket.on('disconnect', () => {
        if (users[socket.id]) delete users[socket.id];
    });
});

http.listen(3000, () => console.log('השרת פעיל ומוכן בפורט 3000'));