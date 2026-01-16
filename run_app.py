#!/usr/bin/env python3
"""
Quick launcher for development - runs the app without packaging.

Usage:
    python run_app.py

Prerequisites:
    - npm run build (to create the dist folder)
    - pip install -r requirements.txt
"""

import subprocess
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).parent

if not (PROJECT_DIR / 'dist' / 'index.html').exists():
    print("Web UI not built. Building now...")
    subprocess.run(['npm', 'run', 'build'], cwd=PROJECT_DIR, check=True)

subprocess.run([sys.executable, 'app.py'], cwd=PROJECT_DIR)
