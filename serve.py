"""Dev-сервер фронта: как `python3 -m http.server`, но запрещает браузеру кэшировать файлы,
чтобы после правок в js/css не нужно было делать жёсткое обновление.

Запуск из папки passdelivery:  python3 serve.py        (порт 5173)
                                python3 serve.py 8080   (другой порт)
"""
import http.server
import socket
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


# Слушаем и IPv6, и IPv4: браузер ходит на localhost через ::1, curl и другие — через 127.0.0.1
class DualStackServer(http.server.ThreadingHTTPServer):
    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    with DualStackServer(("::", port), NoCacheHandler) as httpd:
        print(f"PassDelivery frontend: http://localhost:{port}  (без кэша, Ctrl+C — остановить)")
        httpd.serve_forever()
