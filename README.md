# Cloud Pay Wallet

Ví thanh toán **USDC** trên mạng **Cloud Chain** (Solana) — nhiều ví, mở khoá bằng **Passkey**,
MEMO đẹp cho mỗi giao dịch, thông báo realtime khi tiền vào và sao lưu đám mây mã hoá.

- `web/` — SPA React + Vite + TypeScript (giao diện ví, ký giao dịch, QR, biểu đồ số dư).
- `server/` — API Node/Express: JSON-RPC proxy, giá USDC, sao lưu mã hoá, WebSocket realtime.

## Chạy nhanh

```bash
docker compose -f docker-compose.base44.yml up -d --build
# web  → http://localhost:3000
# api  → http://localhost:8000/health
```

Xem `AGENTS.md` để biết chi tiết kiến trúc, cách kiểm thử và các override chỉ dành cho sandbox.
