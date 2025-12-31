// Sử dụng thuật toán RSA-OAEP cho mã hóa bất đối xứng
const ALGORITHM = {
    name: "RSA-OAEP",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256"
};

export class CryptoManager {
    constructor() {
        this.keyPair = null;
        this.peerPublicKey = null;
    }

    // 1. Tạo cặp khóa (Public & Private)
    async generateKeys() {
        this.keyPair = await window.crypto.subtle.generateKey(
            ALGORITHM,
            true,
            ["encrypt", "decrypt"]
        );
        return this.keyPair;
    }

    // 2. Xuất Public Key để gửi cho đối phương (định dạng JWK)
    async exportPublicKey() {
        if (!this.keyPair) return null;
        return await window.crypto.subtle.exportKey(
            "jwk",
            this.keyPair.publicKey
        );
    }

    // 3. Nhập Public Key của đối phương
    async importPeerPublicKey(jwkData) {
        this.peerPublicKey = await window.crypto.subtle.importKey(
            "jwk",
            jwkData,
            ALGORITHM,
            true,
            ["encrypt"]
        );
    }

    // 4. Mã hóa tin nhắn (Dùng Public Key của ĐỐI PHƯƠNG)
    async encrypt(text) {
        if (!this.peerPublicKey) throw new Error("Chưa có khóa của đối phương!");
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const encrypted = await window.crypto.subtle.encrypt(
            { name: "RSA-OAEP" },
            this.peerPublicKey,
            data
        );
        // Chuyển ArrayBuffer sang Base64 để gửi qua mạng dễ dàng
        return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    }

    // 5. Giải mã tin nhắn (Dùng Private Key của MÌNH)
    async decrypt(encryptedBase64) {
        if (!this.keyPair) throw new Error("Chưa có khóa cá nhân!");
        const binaryString = atob(encryptedBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "RSA-OAEP" },
            this.keyPair.privateKey,
            bytes
        );
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    }
}