// public/js/config.js

export const rtcConfig = {
    iceServers: [
        // 1. STUN Google (Giữ lại để dự phòng)
        { urls: 'stun:stun.l.google.com:19302' },

        // 2. TURN Server riêng của bạn (Từ Metered.ca)
        {
            urls: "turn:global.relay.metered.ca:80",
            username: "16f3dbf3909907c59849076f",
            credential: "q2NrcfA0Xw0aAVDD"
        },
        {
            urls: "turn:global.relay.metered.ca:80?transport=tcp",
            username: "16f3dbf3909907c59849076f",
            credential: "q2NrcfA0Xw0aAVDD"
        },
        {
            urls: "turns:global.relay.metered.ca:443?transport=tcp",
            username: "16f3dbf3909907c59849076f",
            credential: "q2NrcfA0Xw0aAVDD"
        }
    ],
    iceCandidatePoolSize: 10,
};