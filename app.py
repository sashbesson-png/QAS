#!/usr/bin/env python3
"""
SWIR Camera Control - Standalone Desktop Application

Launches the camera control GUI as a native desktop application.
Bundles the websocket server and web UI together.
"""

import sys
import os
import threading
import asyncio
import logging
import time
import http.server
import socketserver
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

DIST_DIR = None
SERVER_PORT = 8765
HTTP_PORT = 5173


def get_dist_path():
    """Get the path to the dist folder, handling both dev and packaged modes."""
    if getattr(sys, 'frozen', False):
        base_path = Path(sys._MEIPASS)
    else:
        base_path = Path(__file__).parent

    dist_path = base_path / 'dist'
    if dist_path.exists():
        return dist_path

    return base_path


def run_websocket_server():
    """Run the websocket server in a separate thread."""
    import server
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(server.main())
    except Exception as e:
        logging.error(f"WebSocket server error: {e}")


class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP handler that serves from dist directory with SPA support."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    def log_message(self, format, *args):
        pass

    def do_GET(self):
        path = self.path.split('?')[0]
        file_path = DIST_DIR / path.lstrip('/')

        if not file_path.exists() and not path.startswith('/assets'):
            self.path = '/index.html'

        return super().do_GET()


def run_http_server():
    """Run a simple HTTP server for the web UI."""
    with socketserver.TCPServer(("", HTTP_PORT), QuietHTTPHandler) as httpd:
        logging.info(f"HTTP server running on port {HTTP_PORT}")
        httpd.serve_forever()


def main():
    global DIST_DIR
    DIST_DIR = get_dist_path()

    if not (DIST_DIR / 'index.html').exists():
        logging.error(f"Web UI not found at {DIST_DIR}")
        logging.error("Please run 'npm run build' first to build the web UI.")
        sys.exit(1)

    logging.info(f"Using dist directory: {DIST_DIR}")

    ws_thread = threading.Thread(target=run_websocket_server, daemon=True)
    ws_thread.start()
    logging.info("WebSocket server started")

    http_thread = threading.Thread(target=run_http_server, daemon=True)
    http_thread.start()

    time.sleep(0.5)

    try:
        import webview

        window = webview.create_window(
            title='SWIR Camera Control',
            url=f'http://localhost:{HTTP_PORT}',
            width=1400,
            height=900,
            min_size=(1024, 700),
            resizable=True,
            confirm_close=True
        )

        logging.info("Starting application window...")
        webview.start(debug=False)

    except ImportError:
        logging.warning("pywebview not installed. Opening in default browser...")
        import webbrowser
        webbrowser.open(f'http://localhost:{HTTP_PORT}')

        logging.info("Press Ctrl+C to stop the server")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass

    logging.info("Application closed")


if __name__ == '__main__':
    main()
