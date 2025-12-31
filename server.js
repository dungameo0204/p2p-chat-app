// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Khi User A muốn tham gia phòng chat
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        // Thông báo cho người khác trong phòng là có người mới vào
        socket.to(roomId).emit('user-connected', socket.id);
    });

    // Chuyển tiếp tín hiệu WebRTC (Offer, Answer, ICE Candidate)
    socket.on('signal', (data) => {
        io.to(data.target).emit('signal', {
            sender: socket.id,
            type: data.type,
            payload: data.payload
        });
    });

    // Chuyển tiếp Khóa Công Khai (Public Key)
    socket.on('exchange-key', (data) => {
        io.to(data.target).emit('exchange-key', {
            sender: socket.id,
            publicKey: data.publicKey
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});