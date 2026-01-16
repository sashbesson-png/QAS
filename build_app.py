#!/usr/bin/env python3
"""
Build script for creating standalone SWIR Camera Control application.

This script:
1. Builds the web UI (npm run build)
2. Packages everything with PyInstaller into a standalone executable

Usage:
    python build_app.py

Requirements:
    - Node.js and npm (for building web UI)
    - PyInstaller (pip install pyinstaller)
    - All requirements from requirements.txt
"""

import subprocess
import sys
import shutil
from pathlib import Path

PROJECT_DIR = Path(__file__).parent
DIST_DIR = PROJECT_DIR / 'dist'
BUILD_DIR = PROJECT_DIR / 'build'
OUTPUT_DIR = PROJECT_DIR / 'standalone'


def run_command(cmd, description):
    """Run a command and handle errors."""
    print(f"\n{'='*60}")
    print(f"  {description}")
    print('='*60)

    result = subprocess.run(cmd, shell=True, cwd=PROJECT_DIR)
    if result.returncode != 0:
        print(f"ERROR: {description} failed!")
        sys.exit(1)

    print(f"SUCCESS: {description}")
    return True


def check_dependencies():
    """Check that required tools are installed."""
    print("\nChecking dependencies...")

    try:
        subprocess.run(['npm', '--version'], capture_output=True, check=True)
        print("  npm: OK")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("  npm: NOT FOUND - Please install Node.js")
        sys.exit(1)

    try:
        subprocess.run([sys.executable, '-m', 'PyInstaller', '--version'],
                      capture_output=True, check=True)
        print("  PyInstaller: OK")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("  PyInstaller: NOT FOUND - Installing...")
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'pyinstaller'])


def build_web_ui():
    """Build the web UI using npm."""
    run_command('npm install', 'Installing npm dependencies')
    run_command('npm run build', 'Building web UI')

    if not (DIST_DIR / 'index.html').exists():
        print("ERROR: Web UI build failed - dist/index.html not found")
        sys.exit(1)


def build_executable():
    """Build the standalone executable using PyInstaller."""
    app_name = 'SWIR-Camera-Control'

    pyinstaller_cmd = f'''
{sys.executable} -m PyInstaller \
    --name="{app_name}" \
    --onedir \
    --windowed \
    --add-data="dist:dist" \
    --add-data="server.py:." \
    --hidden-import=websockets \
    --hidden-import=numpy \
    --hidden-import=PIL \
    --hidden-import=webview \
    --distpath="{OUTPUT_DIR}" \
    --workpath="{BUILD_DIR}" \
    --noconfirm \
    --clean \
    app.py
'''

    run_command(pyinstaller_cmd.replace('\n', ' '), 'Building standalone executable')


def cleanup():
    """Clean up build artifacts."""
    print("\nCleaning up...")

    spec_file = PROJECT_DIR / 'SWIR-Camera-Control.spec'
    if spec_file.exists():
        spec_file.unlink()

    if BUILD_DIR.exists():
        shutil.rmtree(BUILD_DIR)

    print("Cleanup complete")


def main():
    print("="*60)
    print("  SWIR Camera Control - Standalone App Builder")
    print("="*60)

    check_dependencies()
    build_web_ui()
    build_executable()
    cleanup()

    output_path = OUTPUT_DIR / 'SWIR-Camera-Control'
    print("\n" + "="*60)
    print("  BUILD COMPLETE!")
    print("="*60)
    print(f"\nStandalone app created at:")
    print(f"  {output_path}")
    print("\nTo run the application:")

    if sys.platform == 'win32':
        print(f"  {output_path / 'SWIR-Camera-Control.exe'}")
    elif sys.platform == 'darwin':
        print(f"  open {output_path / 'SWIR-Camera-Control.app'}")
    else:
        print(f"  {output_path / 'SWIR-Camera-Control'}")


if __name__ == '__main__':
    main()
