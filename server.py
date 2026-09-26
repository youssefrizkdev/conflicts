#!/usr/bin/env python3
"""
Conflicts Web Server
Serves the Conflicts website locally and on the local network for mobile access.
"""

import os
import sys
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 3000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('1.1.1.1', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

class CustomHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable CORS and disable aggressive caching for local dev
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

def main():
    local_ip = get_local_ip()
    server_address = ('0.0.0.0', PORT)
    
    try:
        httpd = ThreadingHTTPServer(server_address, CustomHandler)
    except OSError as e:
        print(f"Error starting server on port {PORT}: {e}")
        sys.exit(1)

    print("=" * 60)
    print("  🚀 Conflicts App is Running!")
    print("=" * 60)
    print(f"  📱 Mobile URL (same Wi-Fi):  http://{local_ip}:{PORT}")
    print(f"  💻 Localhost URL:             http://localhost:{PORT}")
    print(f"  📂 Serving Directory:         {DIRECTORY}")
    print("=" * 60)
    print("  Press Ctrl+C to stop the server.\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == '__main__':
    main()
