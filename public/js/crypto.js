// public/js/crypto.js - HYBRID ENCRYPTION (RSA + AES-GCM)

// Cấu hình RSA (Dùng để trao đổi khóa AES)
const RSA_ALGORITHM = {
    name: "RSA-OAEP",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256"
};

// Cấu hình AES (Dùng để mã hóa dữ liệu thật)
const AES_ALGORITHM = {
    name: "AES-GCM",
    length: 256
};

export class CryptoManager {
    constructor() {
        this.keyPair = null;      // Cặp khóa RSA của mình
        this.peerPublicKey = null; // Khóa RSA công khai của bạn chat
    }

    // --- 1. Quản lý khóa RSA (Giữ nguyên như cũ) ---
    async generateKeys() {
        this.keyPair = await window.crypto.subtle.generateKey(
            RSA_ALGORITHM,
            true,
            ["encrypt", "decrypt"] // RSA dùng để bọc khóa AES
        );
        return this.keyPair;
    }

    async exportPublicKey() {
        if (!this.keyPair) return null;
        return await window.crypto.subtle.exportKey("jwk", this.keyPair.publicKey);
    }

    async importPeerPublicKey(jwkData) {
        this.peerPublicKey = await window.crypto.subtle.importKey(
            "jwk",
            jwkData,
            RSA_ALGORITHM,
            true,
            ["encrypt"] // Dùng khóa này để mã hóa khóa AES
        );
    }

    // --- 2. Mã hóa Lai (Hybrid Encrypt) ---
    async encrypt(text) {
        if (!this.peerPublicKey) throw new Error("Chưa có khóa của đối phương!");

        // Bước A: Tạo một khóa AES dùng một lần (Session Key)
        const aesKey = await window.crypto.subtle.generateKey(AES_ALGORITHM, true, ["encrypt"]);
        
        // Bước B: Mã hóa nội dung tin nhắn/ảnh bằng khóa AES này
        const iv = window.crypto.getRandomValues(new Uint8Array(12)); // Vector khởi tạo
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        
        const encryptedDataBuffer = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            aesKey,
            data
        );

        // Bước C: Mã hóa chính cái khóa AES đó bằng RSA Public Key của đối phương
        const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
        const encryptedKeyBuffer = await window.crypto.subtle.encrypt(
            { name: "RSA-OAEP" },
            this.peerPublicKey,
            rawAesKey
        );

        // Bước D: Đóng gói tất cả (Khóa AES đã mã hóa + IV + Dữ liệu đã mã hóa) thành chuỗi JSON
        const packageData = {
            key: arrayBufferToBase64(encryptedKeyBuffer),
            iv: arrayBufferToBase64(iv),
            data: arrayBufferToBase64(encryptedDataBuffer)
        };

        return JSON.stringify(packageData);
    }

    // --- 3. Giải mã Lai (Hybrid Decrypt) ---
    async decrypt(packedJson) {
        if (!this.keyPair) throw new Error("Chưa có khóa cá nhân!");

        try {
            const pkg = JSON.parse(packedJson);
            const encryptedKey = base64ToArrayBuffer(pkg.key);
            const iv = base64ToArrayBuffer(pkg.iv);
            const encryptedData = base64ToArrayBuffer(pkg.data);

            // Bước A: Giải mã để lấy lại khóa AES (Dùng RSA Private Key của mình)
            const rawAesKey = await window.crypto.subtle.decrypt(
                { name: "RSA-OAEP" },
                this.keyPair.privateKey,
                encryptedKey
            );

            // Bước B: Nhập khóa AES vừa lấy được vào trình duyệt
            const aesKey = await window.crypto.subtle.importKey(
                "raw",
                rawAesKey,
                AES_ALGORITHM,
                true,
                ["decrypt"]
            );

            // Bước C: Dùng khóa AES đó để giải mã nội dung thật
            const decryptedBuffer = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                aesKey,
                encryptedData
            );

            const decoder = new TextDecoder();
            return decoder.decode(decryptedBuffer);

        } catch (e) {
            console.error("Decryption error detailed:", e);
            throw new Error("Lỗi giải mã: " + e.message);
        }
    }
}

// --- Hàm phụ trợ chuyển đổi Base64 <-> ArrayBuffer ---
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}