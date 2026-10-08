# AGENTS.md

## Cái này là gì

Một trang tĩnh duy nhất: `index.html` (HTML + CSS + JS nằm trong cùng một file, không framework,
không trình quản lý gói, không bước build). Không có gì phải biên dịch — file máy chủ trả về
*chính là* mã nguồn, nên sửa `index.html` là xong vòng lặp phát triển.

Trang làm ba việc: (1) phát hiện môi trường — Chrome OS, Chrome, và ngữ cảnh ứng dụng Chrome
(`chrome.app.runtime`); (2) đăng nhập bằng passkey qua WebAuthn; (3) sau khi đăng nhập thì in ra
`Hello World`.

## Chạy

`docker compose -f docker-compose.base44.yml up -d` phục vụ repo bằng `python:3.12-slim`
(`http.server`) ở cổng 3000 (`previewPort` trong `.base44/environment.json`), checkout được
bind-mount chỉ-đọc. Vì bản mount là trực tiếp và không có bundler, sửa file xong phải **buộc tải
lại trang xem trước** — không có hot reload.

Kiểm tra: `curl -sS http://localhost:3000/ | head` phải trả về markup của trang, và
`docker compose -f docker-compose.base44.yml ps` phải thấy `web` healthy (healthcheck `urllib`
gọi `/`, khai báo chỉ trong file compose — trang không cần endpoint health riêng).

## Những điều dễ hiểu nhầm

- **"Không phải ứng dụng Chrome" là kết quả ĐÚNG ở hầu hết môi trường.** `chrome.app.runtime` chỉ
  tồn tại bên trong một Chrome App đóng gói (đã bị Chrome khai tử). Tab Chrome thường, trình duyệt
  xem trước và iframe của sandbox luôn báo "Trang web thường" — đừng "sửa" thành `true`.
- Tương tự với Chrome OS: `navigator.userAgent` trên máy ảo/trình duyệt xem trước không chứa
  `CrOS`, nên dòng đó hợp lệ khi báo "Không phải Chrome OS". Dòng verdict liệt kê đúng những gì
  còn thiếu.
- **Passkey cần ngữ cảnh an toàn** (HTTPS hoặc localhost) và `rp.id` phải khớp tên miền của origin
  — ở đây dùng thẳng `location.hostname`, nên nó luôn khớp. Trong iframe xem trước, Chrome có thể
  chặn `publickey-credentials-create` bằng Permissions Policy → `NotAllowedError`; đó là chính sách
  của trình duyệt, không phải lỗi của trang. Muốn thử thật, mở URL ở tab riêng trên máy có
  Chrome OS/TPM.
- **Không có máy chủ xác minh.** Trang mẫu chỉ chạy luồng WebAuthn phía client rồi lưu credential
  id trong `localStorage`; chữ ký KHÔNG được kiểm tra ở đâu cả. Đây là trang minh hoạ, không phải
  mẫu bảo mật — đừng dùng làm chuẩn cho sản phẩm thật.
- Service chạy bằng root **có chủ đích**: checkout trong sandbox thuộc root và không cho nhóm khác
  đi qua, nên tiến trình bị hạ quyền sẽ nhận 403 cho mọi file.
- Không cần secret nào; `.base44/environment.json` có `secrets: []`.
