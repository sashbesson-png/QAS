import asyncio
import websockets
import json
import logging
import base64
import time
from io import BytesIO
import numpy as np
from PIL import Image

try:
    import pyqas
    IS_SIMULATED = False
except ImportError:
    IS_SIMULATED = True

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


class SimulatedFrameStreamer:
    def __init__(self):
        self._is_powered = False
        self._is_running = False
        self.integration_time = 500000
        self.frame_rate = 30
        self.aec_enabled = True
        self.aec_lower_limit = 3000
        self.aec_upper_limit = 11000
        self.aec_num_frames = 4
        self.agc_enabled = False
        self.agc_min_target = 4000
        self.agc_max_target = 12000
        self.nuc_enabled = True
        self.bpr_enabled = True
        x = np.linspace(0, 1000, 640)
        y = np.linspace(0, 1000, 512)
        xv, yv = np.meshgrid(x, y)
        self._gradient = (xv + yv).astype(np.uint16)
        self._frame_counter = 0

    def perform_power_up(self):
        self._is_powered = True
        return True

    def perform_power_down(self):
        self._is_powered = False
        self._is_running = False
        return True

    def start(self):
        if self._is_powered:
            self._is_running = True
        return self._is_running

    def stop(self):
        self._is_running = False
        return True

    def is_running(self):
        return self._is_running

    def set_integration_time(self, integration_time):
        self.integration_time = integration_time
        return True

    def get_frames(self, num_frames=1, **kwargs):
        frames = []
        for _ in range(num_frames):
            noise = np.random.randint(4000, 12000, size=(512, 640), dtype=np.uint16)
            frame_data = noise + self._gradient
            self._frame_counter += 1
            mock_frame = type('MockFrame', (), {
                'image': frame_data,
                'rows': 512,
                'columns': 640,
                'frame_id': self._frame_counter,
                'timestamp': time.time()
            })()
            frames.append(mock_frame)
        return frames

    def set_dac_voltage(self, channel, voltage):
        return True

    def read_fpga_register(self, address):
        return np.random.randint(0, 256)

    def write_fpga_registers(self, addresses, values):
        return True

    def write_fpga_register(self, addresses, values):
        return True

    def read_device(self, address):
        return np.random.randint(0, 256)

    def write_device(self, address, data):
        return True

    def read_flash(self, start_address, number_of_words):
        return [np.random.randint(0, 0xFFFFFFFF) for _ in range(number_of_words)]

    def write_flash(self, start_address, data):
        return True

    def erase_flash(self):
        return True

    def read_flash_status(self):
        return 0x00000000

    def enable_nuc(self, enable):
        self.nuc_enabled = bool(enable)
        return True

    def enable_bpr(self, enable):
        self.bpr_enabled = bool(enable)
        return True

    def configure_aec(self, lower_limit=None, upper_limit=None, num_frames_to_average=None, **kwargs):
        if lower_limit is not None:
            self.aec_lower_limit = lower_limit
        if upper_limit is not None:
            self.aec_upper_limit = upper_limit
        if num_frames_to_average is not None:
            self.aec_num_frames = num_frames_to_average
        return True

    def configure_agc(self, min_target_value=None, max_target_value=None, **kwargs):
        if min_target_value is not None:
            self.agc_min_target = min_target_value
        if max_target_value is not None:
            self.agc_max_target = max_target_value
        return True

    def enable_aec(self, enable):
        self.aec_enabled = bool(enable)
        return True

    def enable_agc(self, enable):
        self.agc_enabled = bool(enable)
        return True

    def set_column_sorting(self, enable):
        return True

    def set_row_mirroring(self, enable):
        return True

    def get_temperature(self):
        return 25.0 + np.random.uniform(-0.5, 0.5)

    def read_temperature(self):
        return self.get_temperature()

    def prepareRead(self):
        return True

    def get_integration_time(self):
        return self.integration_time

    def set_frame_rate(self, frame_rate):
        self.frame_rate = max(1, min(60, frame_rate))
        return True

    def get_frame_rate(self):
        return self.frame_rate


camera = None
streaming = False


def get_camera_status():
    global camera
    if not camera:
        return "POWERED_OFF"
    if camera.is_running():
        return "STREAMING"
    if hasattr(camera, '_is_powered') and camera._is_powered:
        return "IDLE"
    return "POWERED_OFF"


def get_camera_info():
    global camera
    if not camera:
        return {"temperature": None, "integration_time_ms": None}

    info = {"temperature": None, "integration_time_ms": None}

    try:
        info["temperature"] = float(camera.read_temperature())
    except:
        pass

    try:
        info["integration_time_ms"] = camera.get_integration_time() / 100_000.0
    except:
        pass

    if hasattr(camera, 'aec_enabled'):
        info["aec"] = {
            "enabled": camera.aec_enabled,
            "lower_limit": getattr(camera, 'aec_lower_limit', None),
            "upper_limit": getattr(camera, 'aec_upper_limit', None),
            "num_frames": getattr(camera, 'aec_num_frames', None)
        }

    if hasattr(camera, 'agc_enabled'):
        info["agc"] = {
            "enabled": camera.agc_enabled,
            "min_target": getattr(camera, 'agc_min_target', None),
            "max_target": getattr(camera, 'agc_max_target', None)
        }

    if hasattr(camera, 'nuc_enabled'):
        info["nuc_enabled"] = camera.nuc_enabled

    if hasattr(camera, 'bpr_enabled'):
        info["bpr_enabled"] = camera.bpr_enabled

    if hasattr(camera, 'frame_rate'):
        info["frame_rate"] = camera.frame_rate

    return info


def create_jpeg_from_frame(frame_obj):
    frame_data = frame_obj.image
    if not isinstance(frame_data, np.ndarray):
        return None, None, None

    raw_min = int(frame_data.min())
    raw_max = int(frame_data.max())
    raw_mean = float(frame_data.mean())

    histogram, _ = np.histogram(frame_data.ravel(), bins=128, range=(0, 16384))

    min_val, max_val = raw_min, raw_max
    if max_val == min_val:
        max_val = min_val + 1
    scale = 255.0 / (max_val - min_val)
    normalized = ((frame_data - min_val) * scale).astype(np.uint8)

    image = Image.fromarray(normalized)
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=70)
    jpeg_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

    return jpeg_b64, histogram.tolist(), {"min": raw_min, "max": raw_max, "mean": raw_mean}


async def send_json(ws, data):
    await ws.send(json.dumps(data))


async def stream_loop(ws):
    global camera, streaming
    logging.info(">>> STREAM LOOP STARTED <<<")
    frame_count = 0

    while streaming and camera and camera.is_running():
        try:
            frames = camera.get_frames(num_frames=1)
            if frames:
                jpeg_b64, histogram, stats = create_jpeg_from_frame(frames[0])
                if jpeg_b64:
                    await send_json(ws, {
                        "type": "image_frame",
                        "data": jpeg_b64,
                        "source": "simulated" if IS_SIMULATED else "live",
                        "histogram": histogram,
                        "stats": stats,
                        "camera_info": get_camera_info()
                    })
                    frame_count += 1
                    if frame_count % 30 == 0:
                        logging.info(f"Sent {frame_count} frames")

            await asyncio.sleep(0.033)

        except websockets.ConnectionClosed:
            logging.info("Connection closed during stream")
            break
        except Exception as e:
            logging.error(f"Stream error: {e}")
            await asyncio.sleep(0.1)

    logging.info(f">>> STREAM LOOP ENDED after {frame_count} frames <<<")
    streaming = False


async def handler(websocket):
    global camera, streaming
    logging.info(f"Client connected: {websocket.remote_address}")

    if camera is None:
        if IS_SIMULATED:
            camera = SimulatedFrameStreamer()
            logging.info("Using SIMULATED camera")
        else:
            try:
                camera = pyqas.FrameStreamer()
                logging.info("Using REAL camera")
            except Exception as e:
                logging.error(f"Failed to init camera: {e}")
                await send_json(websocket, {"type": "error", "message": str(e)})
                return

    await send_json(websocket, {"type": "log", "message": "Connected to camera server"})
    await send_json(websocket, {"type": "status_update", "status": get_camera_status(), "camera_info": get_camera_info()})

    stream_task = None

    try:
        async for message in websocket:
            data = json.loads(message)
            cmd = data.get("command")
            params = data.get("params", {})
            logging.info(f"Command: {cmd}")

            if cmd == "power_on":
                camera.perform_power_up()
                for ch, v in {0: 0.1, 1: 0.9, 2: 2.0}.items():
                    if hasattr(camera, 'set_dac_voltage'):
                        camera.set_dac_voltage(ch, v)
                await send_json(websocket, {"type": "log", "message": "Camera powered on"})
                await send_json(websocket, {"type": "status_update", "status": "IDLE", "camera_info": get_camera_info()})

            elif cmd == "power_off":
                streaming = False
                if stream_task:
                    stream_task.cancel()
                    try:
                        await stream_task
                    except:
                        pass
                camera.perform_power_down()
                await send_json(websocket, {"type": "log", "message": "Camera powered off"})
                await send_json(websocket, {"type": "status_update", "status": "POWERED_OFF", "camera_info": get_camera_info()})

            elif cmd == "start_stream":
                if get_camera_status() == "IDLE":
                    camera.start()
                    streaming = True
                    await send_json(websocket, {"type": "log", "message": "Stream started"})
                    await send_json(websocket, {"type": "status_update", "status": "STREAMING", "camera_info": get_camera_info()})
                    stream_task = asyncio.create_task(stream_loop(websocket))
                else:
                    await send_json(websocket, {"type": "error", "message": "Camera must be IDLE to start stream"})

            elif cmd == "stop_stream":
                streaming = False
                if stream_task:
                    stream_task.cancel()
                    try:
                        await stream_task
                    except:
                        pass
                camera.stop()
                await send_json(websocket, {"type": "log", "message": "Stream stopped"})
                await send_json(websocket, {"type": "status_update", "status": "IDLE", "camera_info": get_camera_info()})

            elif cmd == "get_status":
                await send_json(websocket, {"type": "status_update", "status": get_camera_status(), "camera_info": get_camera_info()})

            elif cmd == "get_frames":
                n = params.get('num_frames', 1)
                frames = camera.get_frames(num_frames=n)
                for f in frames:
                    jpeg_b64, histogram, stats = create_jpeg_from_frame(f)
                    if jpeg_b64:
                        await send_json(websocket, {
                            "type": "image_frame",
                            "data": jpeg_b64,
                            "source": "simulated" if IS_SIMULATED else "live",
                            "histogram": histogram,
                            "stats": stats,
                            "camera_info": get_camera_info()
                        })
                await send_json(websocket, {"type": "log", "message": f"Captured {len(frames)} frame(s)"})

            elif cmd == "set_dac_voltage":
                if hasattr(camera, 'set_dac_voltage'):
                    camera.set_dac_voltage(params.get('channel', 0), params.get('voltage', 0))
                await send_json(websocket, {"type": "log", "message": f"Set DAC {params.get('channel')} to {params.get('voltage')}V"})

            elif hasattr(camera, cmd):
                try:
                    result = getattr(camera, cmd)(**params)
                    await send_json(websocket, {"type": "log", "message": f"Executed {cmd}: {str(result)[:100]}"})
                except Exception as e:
                    await send_json(websocket, {"type": "error", "message": f"Error in {cmd}: {e}"})
            else:
                await send_json(websocket, {"type": "error", "message": f"Unknown command: {cmd}"})

    except websockets.ConnectionClosed:
        logging.info("Client disconnected")
    finally:
        streaming = False
        if stream_task:
            stream_task.cancel()


async def main():
    logging.info("Starting WebSocket server on ws://localhost:8765")
    async with websockets.serve(handler, "localhost", 8765):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
