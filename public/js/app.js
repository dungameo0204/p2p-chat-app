import { rtcConfig } from './config.js';
import { CryptoManager } from './crypto.js';

const socket = io();
const cryptoManager = new CryptoManager();

let peerConnection;
let dataChannel;
let roomId;

// UI Elements
const joinBtn = document.getElementById('join-btn');
const roomInput = document.getElementById('room-input');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const statusText = document.getElementById('status');
const chatPanel = document.getElementById('chat-panel');
const messagesDiv = document.getElementById('messages');

// === 1. Setup & Init ===
joinBtn.addEventListener('click', async () => {
    roomId = roomInput.value;
    if (!roomId) return alert("Nhập tên phòng!");
    
    // Tạo khóa trước khi vào
    statusText.innerText = "Đang tạo khóa bảo mật...";
    await cryptoManager.generateKeys();
    
    socket.emit('join-room', roomId);
    
    // Cập nhật giao diện
    const roomDisplayName = document.getElementById('room-display-name');
    if (roomDisplayName) roomDisplayName.innerText = "Phòng: " + roomId;
    
    document.getElementById('connection-panel').classList.add('hidden');
    chatPanel.classList.remove('hidden');
    addMessage("System", `Đã vào phòng: ${roomId}. Đợi người khác...`);
});

// Xử lý phím Enter để gửi
msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // Chặn xuống dòng
        sendBtn.click();    // Kích hoạt nút gửi
    }
});

// === 2. Socket Events (Signaling) ===

// Khi người khác vào phòng -> Tôi là người chủ động gọi (Offerer)
socket.on('user-connected', async (userId) => {
    addMessage("System", "Người lạ đã vào. Đang thiết lập kết nối an toàn...");
    createPeerConnection(userId);
    
    // Tạo Data Channel
    dataChannel = peerConnection.createDataChannel("chat");
    setupDataChannel(dataChannel);

    // Tạo Offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    socket.emit('signal', { target: userId, type: 'offer', payload: offer });
});

// Nhận tín hiệu (Offer/Answer/ICE)
socket.on('signal', async (data) => {
    if (!peerConnection) createPeerConnection(data.sender);

    if (data.type === 'offer') {
        // Nhận Offer -> Tôi là người trả lời (Answerer)
        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            setupDataChannel(dataChannel);
        };
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.payload));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit('signal', { target: data.sender, type: 'answer', payload: answer });
    
    } else if (data.type === 'answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.payload));
    
    } else if (data.type === 'ice-candidate') {
        if (data.payload) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.payload));
        }
    }
});

// Nhận Khóa Công Khai của đối phương
socket.on('exchange-key', async (data) => {
    await cryptoManager.importPeerPublicKey(data.publicKey);
    // --- [ĐÃ KHÔI PHỤC] Thông báo mã hóa thành công ---
    addMessage("System", "🔒 Đã nhận khóa công khai. Kênh chat đã được MÃ HÓA E2EE.");
    console.log("Key exchanged successfully");
});

// === 3. WebRTC Logic ===

function createPeerConnection(targetId) {
    peerConnection = new RTCPeerConnection(rtcConfig);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { target: targetId, type: 'ice-candidate', payload: event.candidate });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'connected') {
            console.log("P2P Connected");
            // --- [ĐÃ KHÔI PHỤC] Thông báo kết nối thành công ---
            addMessage("System", "✅ Đã kết nối P2P thành công!"); 
            // Khi P2P thông, gửi Public Key của mình
            sendPublicKey(targetId);
        }
    };

    // Theo dõi trạng thái mạng (để biết nếu 4G bị chặn)
    peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState;
        console.log("Trạng thái kết nối P2P:", state);
        if (state === 'failed' || state === 'disconnected') {
            addMessage("System", "❌ Kết nối thất bại. Kiểm tra lại mạng hoặc config TURN.");
        }
    };
}

async function sendPublicKey(targetId) {
    const pubKey = await cryptoManager.exportPublicKey();
    socket.emit('exchange-key', { target: targetId, publicKey: pubKey });
}

function setupDataChannel(channel) {
    channel.onopen = () => console.log("Data Channel Opened");
    channel.onmessage = async (event) => {
        // Nhận tin nhắn mã hóa -> Giải mã
        try {
            const decryptedText = await cryptoManager.decrypt(event.data);
            addMessage("Peer", decryptedText);
        } catch (err) {
            console.error("Giải mã thất bại:", err);
            addMessage("System", "Lỗi: Không thể giải mã tin nhắn.");
        }
    };
}

// === 4. UI Logic ===

sendBtn.addEventListener('click', async () => {
    const text = msgInput.value;
    // Kiểm tra kỹ xem kênh chat đã mở chưa
    if (!text) return;
    if (!dataChannel || dataChannel.readyState !== 'open') {
        return alert("Đợi kết nối P2P ổn định đã bạn ơi!");
    }

    try {
        // Mã hóa trước khi gửi
        const encryptedData = await cryptoManager.encrypt(text);
        dataChannel.send(encryptedData);
        
        addMessage("Me", text); // Hiển thị tin gốc cho mình xem
        msgInput.value = '';
    } catch (err) {
        alert("Chưa có khóa của đối phương hoặc lỗi mã hóa!");
        console.error(err);
    }
});

function addMessage(sender, text) {
    const div = document.createElement('div');
    div.classList.add('message');
    if (sender === "Me") div.classList.add('my-msg');
    else if (sender === "Peer") div.classList.add('peer-msg');
    else div.classList.add('system-msg');
    
    div.innerText = text;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}