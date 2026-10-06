# Sổ Trời — MUST · Gift Sky Live

Bản xem trực tiếp cho bảng quà "Lục Ngộ Sở Thiên", **đồng bộ thời gian thực** từ đúng nguồn dữ
liệu mà [must.ware.baby](https://must.ware.baby) đang dùng, với giao diện được viết lại từ đầu.

## Kiến trúc

| Thư mục | Vai trò |
| --- | --- |
| `api/` | Node + Express. Giữ **một** kết nối tới nguồn gốc, chuẩn hoá dữ liệu (số Bản-USD, tổng từng cột, tổng bảng) và đẩy mọi thay đổi cho client qua SSE. |
| `web/` | Vite + React. Bảng, 7 chủ đề, tìm kiếm, tô sáng ô vừa thay đổi. |

App nằm trên một origin duy nhất: trình duyệt gọi `/api/...` và Vite chuyển tiếp vào service `api`,
nên không cần cấu hình CORS.

### Điểm nối

- `GET /api/stream` — server-sent events, khung `snapshot` đầu tiên được gửi ngay khi kết nối.
- `GET /api/snapshot` — ảnh chụp mới nhất (dùng để kiểm tra nhanh).
- `GET /api/healthz` — 200 khi vòng poll còn sống, 503 khi vòng poll bị treo.

## Chạy

```bash
docker compose -f docker-compose.base44.yml up -d   # -> http://localhost:3000
```

## Cấu hình

`.env.base44-defaults` được nạp **trước** `/run/base44/app.env`, nên secret trên dashboard luôn
ghi đè giá trị mặc định ở đây.

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `UPSTREAM_URL` | worker của must.ware.baby | Nguồn dữ liệu gốc |
| `UPSTREAM_TOKEN` | token đọc công khai | Xác thực với nguồn |
| `POLL_MS` | `5000` | Nhịp hỏi nguồn gốc |
| `RATE_VND` | `300000` | Tỷ giá 1 Bản-USD → ₫ |
