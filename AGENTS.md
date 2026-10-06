# AGENTS.md — Sổ Trời (bản xem trực tiếp của must.ware.baby)

## Chạy
```bash
docker compose -f docker-compose.base44.yml up -d    # http://localhost:3000
docker compose -f docker-compose.base44.yml logs -f api web
```

## Những điều không hiển nhiên

- **Nguồn dữ liệu**: `POST {"action":"load"}` + `Authorization: Bearer <token>` tới Cloudflare
  Worker. Token là token **đọc công khai** nằm ngay trong HTML của must.ware.baby; nó nằm trong
  `.env.base44-defaults` — file này được nạp TRƯỚC `/run/base44/app.env`, nên secret trên
  dashboard luôn thắng. Không ghi token vào `environment:` của compose.
- **Chỉ service `api` được nói chuyện với nguồn gốc.** Trang gốc poll mỗi 8s từ trình duyệt;
  ở đây `api` poll mỗi `POLL_MS` (mặc định 5s) rồi đẩy xuống client bằng SSE. Đừng thêm poll
  phía trình duyệt — sẽ nhân số request lên theo số người xem.
- **Một origin**: chỉ cổng 3000 được publish (Vite 5173 trong container). Mọi endpoint phải giữ
  tiền tố `/api` để proxy của Vite chuyển tiếp; thêm route mới mà quên tiền tố là 404.
- **Nguồn gốc có thể trống**: `status:"live"` với 6 cột / 7 hàng rỗng là trạng thái bình thường
  (trang gốc hiển thị y hệt: các ô trống chờ nhập liệu). Chỉ khi nguồn không trả về cột nào thì
  `status` mới là `empty`. Đừng "sửa" bằng cách coi bảng rỗng là lỗi.
- **`revision`** là dấu vân tay nội dung do `api` tính; chỉ khi nó đổi thì server mới broadcast —
  nhờ vậy client tô sáng đúng những ô vừa thay đổi. Muốn đổi cách so sánh thì sửa `revisionOf()`
  trong `api/src/parse.js` (client tự diff theo `note|name|raw`).
- **Kênh SSE đứt lặng** (proxy đổi, tab bị treo) không phát sự kiện `error`, nên
  `web/src/lib/useLiveSnapshot.js` có watchdog 40s và dựng lại kênh khi tab được xem lại.
  Server đảm bảo có khung ít nhất mỗi 30s (`KEEPALIVE_MS`) — sửa một trong hai thì sửa cả hai.
- **`useCountUp`** nhảy thẳng tới giá trị đúng khi tab bị ẩn, vì `requestAnimationFrame` không
  chạy ở tab ẩn.
- Dependency nằm trong volume riêng (`api_node_modules`, `web_node_modules`) và được `npm install`
  lúc khởi động. Đổi `package.json` thì chạy lại `docker compose -f docker-compose.base44.yml up -d`.
- Vite cấu hình `allowedHosts: true` + polling watcher vì app chạy sau proxy của Base44 và mã
  nguồn được bind-mount.

## Kiểm tra nhanh
```bash
curl -s localhost:3000/api/healthz          # {"ok":true,...}; 503 khi vòng poll treo
curl -s localhost:3000/api/snapshot | head  # ảnh chụp mới nhất
curl -sN localhost:3000/api/stream | head   # khung SSE đầu tiên
```

## Thử với dữ liệu mẫu
Nguồn thật thường trống, muốn thấy bảng có số liệu thì tạo một compose override chỉ để test:
thêm service mock trả JSON đúng dạng `{ok, state:{sheetName, cols, rows}, updated}` và đặt
`UPSTREAM_URL` của service `api` trỏ vào mock (`docker compose -f docker-compose.base44.yml -f /tmp/verify.yml up -d`),
xong thì `docker compose -f docker-compose.base44.yml up -d` để trả lại nguồn thật.
**Không bao giờ ghi vào nguồn thật** — API gốc chỉ được dùng với `action:"load"`.
