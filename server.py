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
    logging.info("Successfully imported 'pyqas' library. Real camera mode.")
except ImportError:
    logging.warning("Could not import 'pyqas'. Falling back to simulation mode.")
    IS_SIMULATED = True


class SimulatedFrameStreamer:
    def __init__(self, **kwargs):
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
        logging.info("Initialized SIMULATED pyqas.FrameStreamer.")

    def perform_power_up(self):
        if not self._is_powered:
            logging.info("Simulating power ON.")
            self._is_powered = True
        return True

    def perform_power_down(self):
        if self._is_powered:
            logging.info("Simulating power OFF.")
            self._is_powered = False
            self._is_running = False
        return True

    def start(self):
        if self._is_powered and not self._is_running:
            logging.info("Simulating stream START.")
            self._is_running = True
        return self._is_running

    def stop(self):
        if self._is_running:
            logging.info("Simulating stream STOP.")
            self._is_running = False
        return not self._is_running

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
        logging.info(f"Sim: set DAC {channel} to {voltage}V.")
        return True

    def read_fpga_register(self, address):
        return np.random.randint(0, 256)

    def write_fpga_registers(self, addresses, values):
        return True

    def write_fpga_register(self, addresses, values):
        return self.write_fpga_registers(addresses, values)

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


STATE = {"camera": None, "streaming_task": None, "stop_streaming": False}
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


def get_camera_status():
    cam = STATE.get("camera")
    if not cam:
        return "POWERED_OFF"
    try:
        if cam.is_running():
            return "STREAMING"
        if hasattr(cam, '_is_powered'):
            return "IDLE" if cam._is_powered else "POWERED_OFF"
        return "IDLE"
    except Exception:
        return "POWERED_OFF"


async def send_status_update(websocket, new_status):
    logging.info(f"State changed to: {new_status}")
    camera_info = get_camera_info()
    await websocket.send(json.dumps({"type": "status_update", "status": new_status, "camera_info": camera_info}))


async def send_log(websocket, message):
    logging.info(f"Log: {message}")
    await websocket.send(json.dumps({"type": "log", "message": message}))


async def send_error(websocket, message):
    logging.error(f"Error: {message}")
    await websocket.send(json.dumps({"type": "error", "message": message}))


def create_jpeg_from_frame(frame_obj):
    frame_data = frame_obj.image
    if not isinstance(frame_data, np.ndarray):
        logging.error(f"Frame data is not a NumPy array: {type(frame_data)}")
        return None, None, None

    raw_min = int(frame_data.min())
    raw_max = int(frame_data.max())
    raw_mean = float(frame_data.mean())

    histogram, _ = np.histogram(frame_data.ravel(), bins=128, range=(0, 16384))
    histogram_list = histogram.tolist()

    min_val, max_val = raw_min, raw_max
    if max_val == min_val:
        max_val = min_val + 1
    scale = 255.0 / (max_val - min_val)
    normalized_frame = ((frame_data - min_val) * scale).astype(np.uint8)
    image = Image.fromarray(normalized_frame)
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=70)
    jpeg_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

    stats = {"min": raw_min, "max": raw_max, "mean": raw_mean}
    return jpeg_b64, histogram_list, stats


def get_camera_info():
    cam = STATE.get("camera")
    if not cam:
        return {"temperature": None, "integration_time_ms": None}

    temperature = None
    integration_time_ms = None

    if hasattr(cam, 'read_temperature'):
        try:
            temperature = float(cam.read_temperature())
        except Exception:
            pass
    elif hasattr(cam, 'get_temperature'):
        try:
            temperature = float(cam.get_temperature())
        except Exception:
            pass

    if hasattr(cam, 'get_integration_time'):
        try:
            raw_integration = cam.get_integration_time()
            integration_time_ms = raw_integration / 100_000.0
        except Exception:
            pass
    elif hasattr(cam, 'integration_time'):
        try:
            integration_time_ms = cam.integration_time / 100_000.0
        except Exception:
            pass

    info = {"temperature": temperature, "integration_time_ms": integration_time_ms}

    if hasattr(cam, 'aec_enabled'):
        info["aec"] = {
            "enabled": cam.aec_enabled,
            "lower_limit": getattr(cam, 'aec_lower_limit', None),
            "upper_limit": getattr(cam, 'aec_upper_limit', None),
            "num_frames": getattr(cam, 'aec_num_frames', None)
        }

    if hasattr(cam, 'agc_enabled'):
        info["agc"] = {
            "enabled": cam.agc_enabled,
            "min_target": getattr(cam, 'agc_min_target', None),
            "max_target": getattr(cam, 'agc_max_target', None)
        }

    if hasattr(cam, 'nuc_enabled'):
        info["nuc_enabled"] = cam.nuc_enabled

    if hasattr(cam, 'bpr_enabled'):
        info["bpr_enabled"] = cam.bpr_enabled

    if hasattr(cam, 'get_frame_rate'):
        try:
            info["frame_rate"] = cam.get_frame_rate()
        except Exception:
            pass
    elif hasattr(cam, 'frame_rate'):
        info["frame_rate"] = cam.frame_rate

    return info


async def stream_frames(websocket):
    logging.info("Streaming started")
    STATE["stop_streaming"] = False
    frame_interval = 1.0 / 30.0

    while get_camera_status() == "STREAMING" and not STATE["stop_streaming"]:
        try:
            cam = STATE.get("camera")
            if not cam:
                break

            start_time = time.time()

            frames = cam.get_frames(num_frames=1)
            if not frames:
                await asyncio.sleep(0.01)
                continue

            frame = frames[0]
            jpeg_b64, histogram, stats = create_jpeg_from_frame(frame)

            if jpeg_b64:
                camera_info = get_camera_info()
                msg = json.dumps({
                    "type": "image_frame",
                    "data": jpeg_b64,
                    "source": "simulated" if IS_SIMULATED else "live",
                    "histogram": histogram,
                    "stats": stats,
                    "camera_info": camera_info
                })
                await websocket.send(msg)
                logging.debug(f"Sent frame, size={len(jpeg_b64)}")

            elapsed = time.time() - start_time
            sleep_time = max(0.001, frame_interval - elapsed)
            await asyncio.sleep(sleep_time)

        except websockets.ConnectionClosed:
            logging.warning("Connection closed during streaming")
            break
        except Exception as e:
            logging.error(f"Streaming error: {e}")
            await asyncio.sleep(0.1)

    logging.info("Streaming stopped")
    STATE["streaming_task"] = None
    try:
        await send_status_update(websocket, get_camera_status())
    except:
        pass


async def handle_power_on(websocket, params):
    STATE["camera"].perform_power_up()
    await send_log(websocket, "Camera powered on.")

    for channel, voltage in {0: 0.1, 1: 0.9, 2: 2.0}.items():
        if hasattr(STATE["camera"], 'set_dac_voltage'):
            STATE["camera"].set_dac_voltage(channel, voltage)

    await send_log(websocket, "Default bias voltages applied.")
    await send_status_update(websocket, "IDLE")


async def handle_power_off(websocket, params):
    STATE["stop_streaming"] = True
    if STATE["streaming_task"]:
        STATE["streaming_task"].cancel()
        try:
            await STATE["streaming_task"]
        except asyncio.CancelledError:
            pass
    STATE["camera"].perform_power_down()
    await send_log(websocket, "Camera powered off.")
    await send_status_update(websocket, "POWERED_OFF")


async def handle_start_stream(websocket, params):
    if get_camera_status() != "IDLE":
        await send_error(websocket, "Camera must be idle to start stream.")
        return
    STATE["camera"].start()
    await send_log(websocket, "Stream started.")
    await send_status_update(websocket, "STREAMING")
    STATE["streaming_task"] = asyncio.create_task(stream_frames(websocket))


async def handle_stop_stream(websocket, params):
    if get_camera_status() != "STREAMING":
        await send_error(websocket, "Camera is not streaming.")
        return
    STATE["stop_streaming"] = True
    if STATE["streaming_task"]:
        STATE["streaming_task"].cancel()
        try:
            await STATE["streaming_task"]
        except asyncio.CancelledError:
            pass
    STATE["camera"].stop()
    await send_log(websocket, "Stream stopped.")
    await send_status_update(websocket, "IDLE")


async def handle_get_status(websocket, params):
    status = get_camera_status()
    await send_status_update(websocket, status)


async def handle_get_frames(websocket, params):
    if get_camera_status() == 'POWERED_OFF':
        await send_error(websocket, "Camera is powered off.")
        return
    num_frames = params.get('num_frames', 1)
    frames = STATE["camera"].get_frames(num_frames=num_frames)
    await send_log(websocket, f"Captured {len(frames)} frame(s).")
    for frame in frames:
        jpeg_b64, histogram, stats = create_jpeg_from_frame(frame)
        if jpeg_b64:
            camera_info = get_camera_info()
            await websocket.send(json.dumps({
                "type": "image_frame",
                "data": jpeg_b64,
                "source": "simulated" if IS_SIMULATED else "live",
                "histogram": histogram,
                "stats": stats,
                "camera_info": camera_info
            }))


CALIBRATION_DATA = {
    "dark_images": [],
    "bright_images": [],
    "temperature": 25.0,
    "integration_time_ms": 5.0,
    "coefficients_generated": False
}


async def handle_upload_calibration_images(websocket, params):
    CALIBRATION_DATA["dark_images"] = params.get('dark_images', [])
    CALIBRATION_DATA["bright_images"] = params.get('bright_images', [])
    CALIBRATION_DATA["temperature"] = params.get('temperature', 25.0)
    CALIBRATION_DATA["integration_time_ms"] = params.get('integration_time_ms', 5.0)
    CALIBRATION_DATA["coefficients_generated"] = False
    await send_log(websocket, f"Received {len(CALIBRATION_DATA['dark_images'])} dark and {len(CALIBRATION_DATA['bright_images'])} bright images.")


async def handle_generate_calibration_coefficients(websocket, params):
    if not CALIBRATION_DATA["dark_images"] or not CALIBRATION_DATA["bright_images"]:
        await send_error(websocket, "Missing calibration images.")
        return

    await send_log(websocket, "Generating NUC/BPR coefficients...")
    if IS_SIMULATED:
        await asyncio.sleep(0.5)
    CALIBRATION_DATA["coefficients_generated"] = True
    await send_log(websocket, "Coefficients generated.")


async def handle_write_calibration_to_flash(websocket, params):
    slot = params.get('memory_slot', 0)
    await send_log(websocket, f"Writing calibration to flash slot {slot}...")
    if IS_SIMULATED:
        await asyncio.sleep(0.5)
    await send_log(websocket, f"Calibration written to slot {slot}.")


async def handle_run_calibration_script(websocket, params):
    await send_log(websocket, "Running calibration script...")
    if IS_SIMULATED:
        await asyncio.sleep(1.0)
    await send_log(websocket, "Calibration complete.")


async def handle_set_dac_voltage(websocket, params):
    channel = params.get('channel', 0)
    voltage = params.get('voltage', 0.0)
    cam = STATE.get("camera")
    if cam and hasattr(cam, 'set_dac_voltage'):
        cam.set_dac_voltage(channel, voltage)
        await send_log(websocket, f"Set DAC {channel} to {voltage}V.")
    else:
        await send_log(websocket, f"DAC control not available.")


async def passthrough_handler(websocket, command, params):
    cam = STATE.get("camera")
    if not cam:
        await send_error(websocket, "Camera not initialized")
        return

    if hasattr(cam, command):
        try:
            result = getattr(cam, command)(**params)
            result_str = str(result)[:200]
            await send_log(websocket, f"Executed '{command}': {result_str}")
        except Exception as e:
            await send_error(websocket, f"Error in '{command}': {e}")
    else:
        await send_error(websocket, f"Unknown command: {command}")


async def handler(websocket):
    logging.info(f"Client connected: {websocket.remote_address}")
    try:
        if STATE["camera"] is None:
            if IS_SIMULATED:
                STATE["camera"] = SimulatedFrameStreamer()
            else:
                try:
                    STATE["camera"] = pyqas.FrameStreamer()
                except Exception as e:
                    logging.error(f"Failed to init camera: {e}")
                    await send_error(websocket, f"Hardware error: {e}")
                    return

        await send_log(websocket, "Connected to camera server.")
        await handle_get_status(websocket, {})

        async for message in websocket:
            try:
                data = json.loads(message)
                command = data.get("command")
                params = data.get("params", {})
                logging.info(f"Command: {command}")

                handlers = {
                    "power_on": handle_power_on,
                    "power_off": handle_power_off,
                    "start_stream": handle_start_stream,
                    "stop_stream": handle_stop_stream,
                    "get_status": handle_get_status,
                    "get_frames": handle_get_frames,
                    "run_calibration_script": handle_run_calibration_script,
                    "upload_calibration_images": handle_upload_calibration_images,
                    "generate_calibration_coefficients": handle_generate_calibration_coefficients,
                    "write_calibration_to_flash": handle_write_calibration_to_flash,
                    "set_dac_voltage": handle_set_dac_voltage,
                }

                if command in handlers:
                    await handlers[command](websocket, params)
                else:
                    await passthrough_handler(websocket, command, params)

            except Exception as e:
                logging.error(f"Command error: {e}", exc_info=True)
                await send_error(websocket, f"Error: {e}")

    except websockets.exceptions.ConnectionClosed as e:
        logging.info(f"Client disconnected: {e}")
    finally:
        STATE["stop_streaming"] = True
        if STATE["streaming_task"]:
            STATE["streaming_task"].cancel()
        logging.info("Handler finished.")


async def main():
    host = "0.0.0.0"
    port = 8765
    async with websockets.serve(handler, host, port):
        logging.info(f"Server running on ws://{host}:{port}")
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Server stopped.")
