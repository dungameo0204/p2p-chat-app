// public/js/config.js
export const rtcConfig = {
    iceServers: [
        // 1. STUN Server của Google (Giữ lại để dò đường cơ bản)
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        
        // 2. TURN Server miễn phí của OpenRelayProject
        // Giúp xuyên qua tường lửa 4G/5G khi STUN thất bại
        {
            urls: [
                "turn:openrelay.metered.ca:80",
                "turn:openrelay.metered.ca:443",
                "turns:openrelay.metered.ca:443?transport=tcp"
            ],
            username: "openrelayproject",
            credential: "openrelayproject"
        }
    ],
    iceCandidatePoolSize: 10,
};