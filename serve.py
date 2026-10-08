#!/usr/bin/env python3
"""Máy chủ tĩnh cho môi trường phát triển — như `python -m http.server` nhưng cấm cache.

`http.server` chỉ gửi `Last-Modified` mà không gửi `Cache-Control`, nên trình duyệt
được phép dùng bản `styles.css`/`app.js` cũ trong cache: sửa tệp xong, tải lại trang
vẫn thấy giao diện cũ (đã gặp thật khi kiểm thử). Máy chủ này gửi
`Cache-Control: no-store` cho mọi phản hồi nên mỗi lần tải lại là một bản mới.

Chỉ dùng cho phát triển; không phải máy chủ production.
"""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3000


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), Handler) as httpd:
    httpd.serve_forever()
