# AGENTS.md — Secure Pay Address (Beta)

Két địa chỉ ví SOL chạy **hoàn toàn phía trình duyệt**. Không có backend, không có API,
không có biến môi trường bí mật: mọi thứ nằm trong `localStorage` của thiết bị.

## Chạy

```bash
docker compose -f docker-compose.base44.yml up -d   # http://localhost:3000
docker compose -f docker-compose.base44.yml logs -f web
```

Chỉ một service `web` (Vite dev server, cổng 3000 -> 5173). `node_modules` nằm trong volume
riêng và được `npm install` lúc khởi động — đổi `package.json` thì chạy lại `up -d`.

## Những điều không hiển nhiên

- **Mọi file chứa JSX phải có đuôi `.jsx`.** Vite từ chối biên dịch JSX trong `.js` và trả
  HTTP 500 cho module đó, khiến `#root` trắng hoàn toàn. `VaultProvider`/`useVault` nằm ở
  `web/src/lib/useVault.jsx` (không phải `.js`).
- **Một bản ghi localStorage duy nhất, đã mã hóa.** `spa.store.v1` là AES-GCM 256 trên toàn bộ
  JSON (theme, cấu hình khóa, danh sách địa chỉ). Khóa dẫn xuất PBKDF2 từ `spa.device.v1` và
  salt `spa.salt.v1`. AES-GCM là mã hóa *có xác thực*: sửa bản mã => giải mã thất bại => màn hình
  "Không mở được két" (đúng thiết kế, không phải lỗi hiển thị).
- **Giới hạn bảo mật cố hữu:** `spa.device.v1` phải đọc được trước khi mở khóa, nên người đọc
  được localStorage có thể giải mã két. Passkey/PIN là *cổng truy cập ứng dụng*, không phải khóa
  mật mã. Muốn chống giả mạo thật sự thì phải có backend xác minh WebAuthn.
- **Passkey là phương thức chính, PIN là dự phòng.** `navigator.credentials.create/get` là
  authenticator nền tảng (ChromeOS Flex dùng được). Khi `isUserVerifyingPlatformAuthenticatorAvailable()`
  trả về false (hoặc WebAuthn lỗi), màn hình thiết lập tự chuyển sang đặt mã PIN 4–8 chữ số
  (lưu bằng PBKDF2 một chiều). Đây là đường dùng được để kiểm thử tự động.
- **`ident` là mỏ neo chống giả mạo, không sửa được.** Khi tạo, ident được tách thành các mảnh
  và neo vào `{start, chunk}` trong địa chỉ (`identPositions`), kèm băm SHA-256 một chiều
  (`identHash`). Mỗi lần sao chép phải khớp lại đúng các ký tự ở các vị trí đã neo; lệch =>
  cảnh báo, chặn sao chép và mở trình soạn để buộc sửa lại địa chỉ. Sửa địa chỉ cũng phải giữ
  đúng các ký tự đã neo, nên nhãn/màu sửa được nhưng địa chỉ thì bị ràng buộc bởi ident.
- **Sửa entry cần xác thực lại** (`AuthPrompt`), không chỉ cần két đang mở.
- **Sao chép cần document có focus.** Chrome từ chối `navigator.clipboard.writeText` khi
  `document.hasFocus()` là false (`NotAllowedError: Document is not focused`) và
  `document.execCommand('copy')` cũng trả về false. Ứng dụng cố tình **không** báo thành công khi
  việc ghi clipboard thất bại — nó hiện thông báo "Trình duyệt chặn sao chép". Vì vậy trong
  khung preview tự động, thao tác sao chép và tooltip thời gian **không kiểm thử tự động được**;
  phải bấm thử trong tab thật (đã có focus).
- **Tooltip thời gian dài:** sau khi ghi clipboard thành công, thẻ hiện băng "Đã sao chép … lúc
  HH:MM:SS" trong 9 giây (`COPY_TOOLTIP_MS` trong `Workspace.jsx`).
- **Khóa tự động** (`useIdleLock`) theo `autoLockMs`; tab bị ẩn quá hạn thì khóa ngay khi quay
  lại. Nạp lại trang cũng luôn ở trạng thái khóa.
- **Vite + proxy preview:** `vite.config.js` chỉ mở `allowedHosts` cho `.<BASE44_SANDBOX_HOST_DOMAIN>`
  khi `BASE44_PREVIEW_MODE === '1'`; đặt `BASE44_PREVIEW_MODE` và `BASE44_SANDBOX_HOST_DOMAIN`
  dưới dạng biến trần trong compose. Không hardcode host đã phân giải. Đặt `BASE44_PREVIEW_MODE`
  bằng giá trị khác thì hành vi trở về mặc định của Vite.
- Icon là SVG nội tuyến (`components/Icon.jsx`), không dùng thư viện ngoài.

## Kiểm tra nhanh

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/                      # 200
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/src/lib/useVault.jsx  # 200 (200 = JSX biên dịch được)
```

Luồng thủ công đầy đủ: thiết lập bằng PIN -> thêm địa chỉ + bấm "Gợi ý" để sinh ident -> lưu ->
sao chép (tooltip 9 giây) -> sửa (đổi địa chỉ sai lệch sẽ bị ident chặn) -> khóa -> mở khóa -> xóa.

## Dọn dẹp

Dữ liệu nằm trong localStorage của **trình duyệt**, không phải trong repo. Muốn xóa: Cài đặt ->
"Xóa toàn bộ két", hoặc `localStorage.clear()` cho origin đó.
