# AGENTS.md

## Cái này là gì

Trang mẫu một trang, không framework, không bước build, không trình quản lý gói — máy chủ trả về
chính mã nguồn, nên sửa tệp là xong vòng lặp phát triển:

- `index.html` — markup: dải trạng thái, hero, ba mục 01/02/03 (phát hiện môi trường, cửa khoang
  passkey, khoang làm việc).
- `styles.css` — design system “buồng lái quỹ đạo” (nền tinh vân, panel thuỷ tinh, hairline cyan,
  amber; chỉ dùng font hệ thống nên không phụ thuộc mạng).
- `app.js` — toàn bộ logic: phát hiện môi trường, WebAuthn, bảng chọn vẽ bằng canvas, khung xem +
  lớp chắn, lớp cản devtools/copy.

## Chạy

`docker compose -f docker-compose.base44.yml up -d` phục vụ repo bằng `python:3.12-slim`
(`http.server`) ở cổng 3000, checkout bind-mount chỉ-đọc. Không có bundler ⇒ không có hot reload:
sau khi sửa phải **buộc tải lại trang xem trước**.

Kiểm tra nhanh:

```bash
curl -sS http://localhost:3000/ | head            # markup trang
curl -sI http://localhost:3000/app.js             # 200 => tệp tĩnh phục vụ đúng
docker compose -f docker-compose.base44.yml ps    # web healthy
```

## Luồng hoạt động

1. Mục 01 đọc môi trường: Chrome OS (`CrOS`), Chrome, ứng dụng Chrome (`chrome.app.runtime`),
   ngữ cảnh an toàn, hỗ trợ passkey và passkey nền tảng.
2. Mục 02 là cửa khoang: tạo passkey (`credentials.create`) hoặc mở bằng passkey đã lưu
   (`credentials.get`, `userVerification: required`).
3. Khoang làm việc (mục 03) **chỉ hiện sau khi xác thực passkey** — đây là yêu cầu của người dùng:
   đừng thêm nút “xem thử” hay mở khoá sẵn. Hệ quả: trong sandbox xem trước (không có platform
   authenticator) người xem chỉ thấy mục 01–03 ở trạng thái khoá; muốn xem phần trong khoang phải
   chạy kiểm thử có authenticator ảo (bên dưới).
4. Trong khoang: bảng chọn ứng dụng vẽ bằng canvas (`← →` chọn, `Enter` mở, hoặc bấm chuột), dải URL
   vẽ bằng canvas, iframe co giãn (16/10, 4/3 dưới 700px, có nút “Mở rộng”).

## Những điều dễ hiểu nhầm

- `[hidden]{display:none !important}` trong `styles.css` là **bắt buộc**: `.bay`/`.lockbay` đặt
  `display` riêng nên thuộc tính `hidden` sẽ bị ghi đè và khoang làm việc lộ ra trước khi mở khoá.
- **URL chỉ sống trong bộ nhớ** (mảng `apps` trong `app.js`) và chỉ hiện dưới dạng điểm ảnh trên
  canvas: không có URL nào trong HTML, không ghi vào `localStorage` (chỉ credential id được lưu, để
  còn đăng nhập lại). Đừng thêm URL vào markup hay lưu nó xuống máy.
- **Không thể chặn devtools thật.** `app.js` chỉ cản `F12`, `Ctrl/Cmd+Shift+I,J,C,K`, `Ctrl/Cmd+U,S,P`,
  chuột phải, bôi đen và sao chép — mỗi lần chặn hiện một toast đếm số lần. Ai mở devtools bằng menu
  trình duyệt vẫn xem được mọi thứ; đừng hứa hơn thế.
- Lớp chắn canvas phủ trên iframe: khi đang bật, click đầu tiên chỉ để tắt lớp chắn; rời khỏi khung
  thì tự bật lại. Trang trong iframe là cross-origin nên **không thể** chặn chuột phải bên trong nó.
- Nhiều trang chặn nhúng (`X-Frame-Options` / CSP `frame-ancestors`) ⇒ khung trắng, và
  `curl -sI` **không phải lúc nào cũng thấy** (ví dụ `news.ycombinator.com` chặn qua CSP mà curl
  không hiện `frame-ancestors`). Muốn chắc, thử bằng trình duyệt thật rồi xem console.
- Chỉ một origin/cổng 3000; không cần allowlist host vì `http.server` không kiểm tra `Host`.

## Kiểm thử luồng passkey (không cần thiết bị thật)

Sandbox không có platform authenticator nên `credentials.create()` trả `NotAllowedError` và mục 02
không mở được. Cách kiểm thử đã chạy được: authenticator ảo qua CDP trong container puppeteer.

```bash
# script đặt ở /tmp (không commit); cổng 3000 của host dùng chung network
docker run --rm --network host -e NODE_PATH=/home/pptruser/node_modules \
  -v /tmp/verify:/work -w /work ghcr.io/puppeteer/puppeteer:latest node flow.js
```

Khung script: launch headless → `page.goto('http://localhost:3000/')` →
`WebAuthn.enable` + `WebAuthn.addVirtualAuthenticator({protocol:'ctap2', ctap2Version:'ctap2_1',
transport:'internal', hasResidentKey:true, hasUserVerification:true, isUserVerified:true,
automaticPresenceSimulation:true})` → `page.click('#btnRegister')` → chờ `#bay` hiện → lái bàn phím
trên `#dock` → đọc `#frame[src]`, rồi `page.reload()` + `#btnLogin` để kiểm tra luồng mở lại.

Hai cái bẫy khi viết script: helper phải khai báo **bên trong** `page.evaluate` (biến ngoài closure
không tồn tại trong trang), và muốn nhập lại URL thì phải `Ctrl+A` trong `#urlInput` trước khi gõ
(`click` ba lần không xoá nội dung đáng tin cậy).
