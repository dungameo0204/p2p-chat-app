// public/js/app.js - Phiên bản hỗ trợ Hình ảnh & Emoji

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
const fileInput = document.getElementById('file-input'); // Input file ẩn
const fileBtn = document.getElementById('file-btn');     // Nút ghim giấy

// === 1. Setup & Init ===
joinBtn.addEventListener('click', async () => {
    roomId = roomInput.value;
    if (!roomId) return alert("Nhập tên phòng!");
    
    statusText.innerText = "Đang tạo khóa bảo mật...";
    await cryptoManager.generateKeys();
    
    socket.emit('join-room', roomId);
    
    const roomDisplayName = document.getElementById('room-display-name');
    if (roomDisplayName) roomDisplayName.innerText = "Phòng: " + roomId;
    
    document.getElementById('connection-panel').classList.add('hidden');
    chatPanel.classList.remove('hidden');
    addMessage("System", `Đã vào phòng: ${roomId}. Đợi người khác...`);
});

// Xử lý phím Enter để gửi text
msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
    }
});

// --- LOGIC MỚI: Xử lý chọn file ảnh ---
fileBtn.addEventListener('click', () => fileInput.click()); // Bấm nút ghim -> kích hoạt input file

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        return alert('Chỉ hỗ trợ gửi file ảnh!');
    }

    // Tạo một FileReader để đọc ảnh
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        
        img.onload = async () => {
            // 1. Tạo Canvas để vẽ lại ảnh (Nén kích thước)
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Tính toán tỷ lệ để resize (Max chiều rộng/cao là 800px)
            const MAX_SIZE = 800;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                }
            } else {
                if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            // 2. Xuất ảnh đã nén ra dạng Base64 (JPEG chất lượng 0.7)
            // Cách này giúp giảm dung lượng từ vài MB xuống còn vài chục KB -> Gửi siêu nhanh!
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
            
            // 3. Gửi đi
            try {
                await sendMessage('image', compressedBase64);
            } catch (err) {
                console.error(err);
                alert("Ảnh vẫn quá lớn hoặc lỗi mạng, thử ảnh nhỏ hơn xem!");
            }
            
            // Reset input
            fileInput.value = ''; 
        };
    };
    reader.readAsDataURL(file);
});
// --------------------------------------


// === 2. Socket Events (Signaling) ===

socket.on('user-connected', async (userId) => {
    addMessage("System", "Người lạ đã vào. Đang thiết lập kết nối an toàn...");
    createPeerConnection(userId);
    
    // Offerer tạo Data Channel
    dataChannel = peerConnection.createDataChannel("chat");
    setupDataChannel(dataChannel);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('signal', { target: userId, type: 'offer', payload: offer });
});

socket.on('signal', async (data) => {
    if (!peerConnection) createPeerConnection(data.sender);

    if (data.type === 'offer') {
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
        if (data.payload) await peerConnection.addIceCandidate(new RTCIceCandidate(data.payload));
    }
});

socket.on('exchange-key', async (data) => {
    await cryptoManager.importPeerPublicKey(data.publicKey);
    addMessage("System", "🔒 Đã nhận khóa công khai. Kênh chat đã được MÃ HÓA E2EE.");
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
            addMessage("System", "✅ Đã kết nối P2P thành công!");
            sendPublicKey(targetId);
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState;
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
    
    // --- LOGIC MỚI: Xử lý nhận tin nhắn (Text hoặc Ảnh) ---
    channel.onmessage = async (event) => {
        try {
            // 1. Giải mã
            const decryptedString = await cryptoManager.decrypt(event.data);
            // 2. Parse JSON để biết loại tin nhắn
            const data = JSON.parse(decryptedString);

            if (data.type === 'text') {
                addMessage("Peer", data.content, 'text');
            } else if (data.type === 'image') {
                addMessage("Peer", data.content, 'image');
            }

        } catch (err) {
            console.error("Lỗi xử lý tin nhắn đến:", err);
            // Nếu không parse được JSON thì có thể là tin nhắn kiểu cũ hoặc lỗi giải mã
            addMessage("System", "Lỗi: Không thể đọc nội dung tin nhắn.");
        }
    };
    // ----------------------------------------------------
}

// === 4. UI Logic & Hàm Gửi Tin Chung ===

// Nút gửi text
sendBtn.addEventListener('click', async () => {
    const text = msgInput.value.trim();
    if (!text) return;
    await sendMessage('text', text);
    msgInput.value = '';
});

// --- HÀM GỬI TIN CHUNG (QUAN TRỌNG) ---
async function sendMessage(type, content) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
        return alert("Đợi kết nối P2P ổn định đã bạn ơi!");
    }

    try {
        // 1. Đóng gói thành JSON object
        const payload = JSON.stringify({
            type: type,       // 'text' hoặc 'image'
            content: content  // nội dung chữ hoặc chuỗi base64 ảnh
        });

        // 2. Mã hóa cả cục JSON string đó
        const encryptedData = await cryptoManager.encrypt(payload);
        
        // 3. Gửi đi
        dataChannel.send(encryptedData);
        
        // 4. Hiển thị lên màn hình của mình
        addMessage("Me", content, type);
        
    } catch (err) {
        alert("Lỗi khi mã hóa hoặc gửi tin!");
        console.error(err);
    }
}

// --- Cập nhật hàm hiển thị để hỗ trợ ảnh ---

// --- HÀM HIỂN THỊ TIN NHẮN & TẢI ẢNH ---
function addMessage(sender, content, type = 'text') {
    const div = document.createElement('div');
    div.classList.add('message');
    
    // Phân loại tin nhắn (của mình, của bạn, hay hệ thống)
    if (sender === "Me") div.classList.add('my-msg');
    else if (sender === "Peer") div.classList.add('peer-msg');
    else div.classList.add('system-msg');
    
    // Xử lý nội dung
    if (sender === "System") {
        div.innerText = content;
    } else if (type === 'text') {
        div.innerText = content;
    } else if (type === 'image') {
        const img = document.createElement('img');
        img.src = content;
        img.title = "Bấm để tải ảnh về"; // Hiện chú thích khi di chuột vào
        
        // --- TÍNH NĂNG MỚI: BẤM ĐỂ TẢI ---
        img.onclick = () => {
            const a = document.createElement('a');
            a.href = content; // Nội dung ảnh (Base64)
            
            // Đặt tên file ngẫu nhiên theo thời gian để không bị trùng
            const timestamp = new Date().getTime();
            a.download = `photo_${timestamp}.jpg`; 
            
            document.body.appendChild(a);
            a.click(); // Tự động bấm tải
            document.body.removeChild(a); // Dọn dẹp sau khi tải xong
        };
        // ---------------------------------
        
        div.appendChild(img);
    }
    
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}