# Tab Injector — Chrome extension (Manifest V3)

Extension nhỏ gọn cho phép lưu **một bộ JS + CSS riêng cho từng tab id**, rồi tiêm đúng bộ file
đó vào đúng tab — kể cả sau khi trang được tải lại.

## Tính năng

- Mỗi bản ghi lưu: **tên** (người dùng đặt), **tab id**, **hostname**, **file JS**, **file CSS**.
- Toggle **Nhận diện theo: Tab id / Hostname** — chọn cách extension tìm tab để tiêm.
- Click vào một bản ghi trong danh sách → extension mở đúng tab đó và tiêm JS + CSS đã lưu.
- Tự tiêm lại sau mỗi lần tab tải lại (service worker + content script).
- **Áp dụng** (tiêm vào tab khớp), **Tiêm lại** (mở tab rồi tiêm lại từ đầu, CSS cũ được gỡ trước
  khi chèn lại), **Tải lại** (tải lại trang của tab khớp rồi tiêm lại khi tải xong).
- **⏸ Dừng / ▶ Chạy**: tạm dừng script đang chạy của bản ghi (gỡ CSS và cho JS tự dọn phần đã thêm
  vào trang); khi đang tạm dừng, extension không tiêm lại sau mỗi lần tải trang. Bấm **▶ Chạy** để
  tiêm lại ngay.
- Thêm / đổi tên / xoá bản ghi ngay trong popup.

## Cấu trúc

```
manifest.json                  # khai báo MV3: permissions, service worker, content script, popup
background/service-worker.js   # đọc bản ghi, tiêm bằng chrome.scripting, tự tiêm lại khi tab reload
content/content.js             # báo "trang đã sẵn sàng" để tiêm lại sau mỗi lần tải trang
popup/popup.html               # giao diện popup
popup/popup.css                # style popup
popup/popup.js                 # logic popup (danh sách, thêm/sửa/xoá, áp dụng, tiêm lại)
injected/catalog.json          # danh sách file JS/CSS cho phép chọn trong popup
injected/scripts/*.js          # các file JS được tiêm vào trang
injected/styles/*.css          # các file CSS được tiêm vào trang
icons/                         # icon extension
preview/                       # trang xem trước popup (chỉ dùng khi dev, không thuộc extension)
```

Mã JS/CSS được tiêm **không** nằm trong popup: popup chỉ lưu đường dẫn file và gọi service worker,
service worker mới là nơi thực hiện `chrome.scripting.insertCSS` / `executeScript`.

## Load unpacked

1. Mở `chrome://extensions` trong Chrome.
2. Bật **Developer mode** (góc trên bên phải).
3. Bấm **Load unpacked** và chọn thư mục gốc của repo này — thư mục chứa `manifest.json`.
4. Ghim extension lên thanh công cụ và mở popup.

## Sử dụng

1. Mở tab bạn muốn tiêm, rồi mở popup.
2. Chọn chế độ ở thanh **Nhận diện theo**:
   - **Tab id**: chỉ tiêm vào đúng tab đã lưu (tab đóng thì bản ghi báo “tab đã đóng”).
   - **Hostname**: tiêm vào mọi tab đang mở cùng hostname — không phụ thuộc tab id, tab đóng hay
     Chrome khởi động lại.
3. Ở mục **Thêm bản ghi**: nhập tên, chọn tab, chọn file JS và file CSS → **Thêm bản ghi**.
   Bản ghi luôn lưu cả tab id và hostname, nên đổi chế độ được bất cứ lúc nào.
   (Mỗi khoá chỉ có một bản ghi; thêm lại cho cùng tab/hostname sẽ cập nhật bản ghi cũ.)
4. Click vào bản ghi trong danh sách: extension chuyển sang đúng tab và tiêm JS + CSS.
5. **Áp dụng** tiêm vào tab khớp mà không chuyển tab; **Tiêm lại** mở tab và tiêm lại từ đầu;
   **Tải lại** tải lại trang của tab khớp rồi tiêm lại khi tải xong.
6. Tải lại trang bằng tay: bộ file của bản ghi cũng được tiêm lại tự động.
7. **⏸ Dừng** để tạm dừng script của bản ghi đang chọn: CSS bị gỡ, JS được gọi hàm dọn dẹp và
   extension ngừng tự tiêm khi tab tải lại. Nút đổi thành **▶ Chạy** để tiêm lại và chạy tiếp.

## Thêm file JS/CSS mới

1. Tạo file trong `injected/scripts/` hoặc `injected/styles/`.
2. Khai báo vào `injected/catalog.json`:

   ```json
   { "file": "injected/scripts/ten-file.js", "label": "ten-file.js — mô tả ngắn" }
   ```

3. Mở lại popup, file mới xuất hiện trong ô chọn.

File JS được chạy ở `world: "MAIN"` nên truy cập được `window` của trang; nên viết theo kiểu
chạy lại nhiều lần vẫn an toàn (dùng lại phần tử theo `id`, như hai file mẫu).

Để nút **⏸ Dừng** gỡ được phần đã thêm vào trang, mỗi file JS tiêm đăng ký một hàm dọn dẹp:

```js
const cleanups = (window.__tabInjectorCleanups = window.__tabInjectorCleanups || {});
// ... phần thêm vào trang ...
cleanups['ten-file'] = () => {
  /* gỡ phần đã thêm */
};
```

## Ghi chú

- Không tiêm được vào `chrome://*`, Chrome Web Store và trang nội bộ của extension — popup sẽ báo lỗi.
- Tab id thay đổi sau khi khởi động lại Chrome. Bật chế độ **Hostname** để bản ghi tiếp tục khớp mà
  không cần lưu lại; ở chế độ **Tab id**, bản ghi hiển thị “tab đã đóng”.
- Ở chế độ Hostname, mọi tab đang mở cùng hostname đều được tiêm (so khớp chính xác hostname, không
  gộp `www.`).
- Dữ liệu lưu trong `chrome.storage.local`.

## Xem trước giao diện (không cần cài extension)

```bash
docker compose -f docker-compose.base44.yml up -d
```

Mở http://localhost:3000 — trang này render **popup thật** trong iframe với `chrome.*` được mô
phỏng (`preview/chrome-mock.js`), kèm nhật ký tiêm giả lập.
