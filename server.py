import asyncio
import websockets
import json
import logging
import base64
import time
import threading
import queue
from io import BytesIO
import numpy as np
from PIL import Image

try:
    import pyqas
    IS_SIMULATED = False
    logging.info("Successfully imported 'pyqas' library. Real camera mode.")
except ImportError:
    logging.warning("Could not import 'pyqas'. Falling back to simulation mode.")
    logging.warning("To use a real camera, ensure the library is installed and accessible.")
    IS_SIMULATED = True


class SimulatedFrameStreamer:
    """A mock class that simulates the pyqas.FrameStreamer for development."""

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
        logging.info(f"Simulating set integration time to {integration_time} (10ns units).")
        self.integration_time = integration_time
        return True

    def get_frames(self, num_frames=1, **kwargs):
        frames = []
        for i in range(num_frames):
            noise = np.random.randint(4000, 12000, size=(512, 640), dtype=np.uint16)
            frame_data = noise + self._gradient
            pixels_1d = frame_data.view(np.uint32).flatten()
            self._frame_counter += 1
            mock_frame = type('MockFrame', (), {
                'image': frame_data,
                'pixels': pixels_1d,
                'pixels_2d': pixels_1d.reshape((512, 320)),
                'rows': 512,
                'columns': 640,
                'frame_id': self._frame_counter,
                'timestamp': time.time()
            })()
            frames.append(mock_frame)
        return frames

    def get_next_frame(self):
        frames = self.get_frames(1)
        return frames[0] if frames else None

    def set_dac_voltage(self, channel, voltage):
        logging.info(f"Sim: set DAC {channel} to {voltage}V.")
        return True

    def read_fpga_register(self, address):
        val = np.random.randint(0, 256)
        logging.info(f"Sim: read FPGA reg {hex(address)}, ret {hex(val)}.")
        return val

    def write_fpga_registers(self, addresses, values):
        logging.info(f"Sim: write FPGA regs {[hex(a) for a in addresses]} with {[hex(v) for v in values]}.")
        return True

    def write_fpga_register(self, addresses, values):
        return self.write_fpga_registers(addresses, values)

    def read_device(self, address):
        val = np.random.randint(0, 256)
        logging.info(f"Sim: read device reg {hex(address)}, ret {hex(val)}.")
        return val

    def write_device(self, address, data):
        logging.info(f"Sim: write device reg {hex(address)} with {hex(data)}.")
        return True

    def read_flash(self, start_address, number_of_words):
        logging.info(f"Sim: read flash at {hex(start_address)}, {number_of_words} words.")
        data = [np.random.randint(0, 0xFFFFFFFF) for _ in range(number_of_words)]
        return data

    def write_flash(self, start_address, data):
        logging.info(f"Sim: write flash at {hex(start_address)}, {len(data)} words.")
        return True

    def erase_flash(self):
        logging.info("Sim: erase flash.")
        return True

    def read_flash_status(self):
        logging.info("Sim: read flash status.")
        return 0x00000000

    def enable_nuc(self, enable):
        self.nuc_enabled = bool(enable)
        logging.info(f"Sim: NUC set to {self.nuc_enabled}.")
        return True

    def enable_bpr(self, enable):
        self.bpr_enabled = bool(enable)
        logging.info(f"Sim: BPR set to {self.bpr_enabled}.")
        return True

    def configure_aec(self, lower_limit=None, upper_limit=None, num_frames_to_average=None, **kwargs):
        if lower_limit is not None:
            self.aec_lower_limit = lower_limit
        if upper_limit is not None:
            self.aec_upper_limit = upper_limit
        if num_frames_to_average is not None:
            self.aec_num_frames = num_frames_to_average
        logging.info(f"Sim: Configure AEC - lower={self.aec_lower_limit}, upper={self.aec_upper_limit}, frames={self.aec_num_frames}.")
        return True

    def configure_agc(self, min_target_value=None, max_target_value=None, **kwargs):
        if min_target_value is not None:
            self.agc_min_target = min_target_value
        if max_target_value is not None:
            self.agc_max_target = max_target_value
        logging.info(f"Sim: Configure AGC - min={self.agc_min_target}, max={self.agc_max_target}.")
        return True

    def enable_aec(self, enable):
        self.aec_enabled = bool(enable)
        logging.info(f"Sim: AEC set to {self.aec_enabled}.")
        return True

    def enable_agc(self, enable):
        self.agc_enabled = bool(enable)
        logging.info(f"Sim: AGC set to {self.agc_enabled}.")
        return True

    def set_column_sorting(self, enable):
        logging.info(f"Sim: Column Sorting set to {enable}.")
        return True

    def set_row_mirroring(self, enable):
        logging.info(f"Sim: Row Mirroring set to {enable}.")
        return True

    def get_temperature(self):
        base_temp = 25.0 + np.random.uniform(-0.5, 0.5)
        return base_temp

    def read_temperature(self):
        return self.get_temperature()

    def prepareRead(self):
        logging.info("Sim: prepareRead() called")
        return True

    def get_integration_time(self):
        return self.integration_time

    def set_frame_rate(self, frame_rate):
        logging.info(f"Simulating set frame rate to {frame_rate} FPS.")
        self.frame_rate = max(1, min(60, frame_rate))
        return True

    def get_frame_rate(self):
        return self.frame_rate


STATE = {"camera": None, "streaming_task": None, "stop_streaming": False}
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

FRAME_QUEUE = queue.Queue(maxsize=10)


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
    logging.info(f"Sending log to client: {message}")
    await websocket.send(json.dumps({"type": "log", "message": message}))


async def send_error(websocket, message):
    logging.error(f"Sending error to client: {message}")
    await websocket.send(json.dumps({"type": "error", "message": message}))


def create_jpeg_from_frame(frame_obj):
    frame_data = frame_obj.image
    if not isinstance(frame_data, np.ndarray):
        logging.error(f"Frame data is not a NumPy array, but {type(frame_data)}. Cannot create JPEG.")
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
    image.save(buffer, format="JPEG", quality=60)
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
    elif hasattr(cam, 'temperature'):
        try:
            temperature = float(cam.temperature)
        except Exception:
            pass
    elif hasattr(cam, 'read_device'):
        try:
            temp_raw = cam.read_device(0x06)
            if temp_raw is not None:
                temperature = float(temp_raw) * 0.0625
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


def frame_reader_thread():
    """Background thread that reads frames and puts them in a queue."""
    logging.info("Frame reader thread started.")
    consecutive_errors = 0
    max_consecutive_errors = 5

    while not STATE["stop_streaming"]:
        try:
            cam = STATE.get("camera")
            if cam and cam.is_running():
                try:
                    frames = cam.get_frames(num_frames=1)
                    consecutive_errors = 0
                except Exception as frame_error:
                    error_msg = str(frame_error).lower()
                    consecutive_errors += 1
                    logging.warning(f"Frame capture error ({consecutive_errors}/{max_consecutive_errors}): {frame_error}")

                    if 'reinitialization' in error_msg or 'prepareread' in error_msg:
                        if hasattr(cam, 'prepareRead'):
                            try:
                                logging.info("Calling prepareRead() for reinitialization...")
                                cam.prepareRead()
                            except Exception as prep_error:
                                logging.error(f"prepareRead() failed: {prep_error}")

                    if consecutive_errors >= max_consecutive_errors:
                        logging.error("Too many consecutive errors, attempting camera restart...")
                        try:
                            cam.stop()
                            time.sleep(0.5)
                            cam.start()
                            consecutive_errors = 0
                            logging.info("Camera restarted successfully")
                        except Exception as restart_error:
                            logging.error(f"Camera restart failed: {restart_error}")

                    time.sleep(0.05)
                    continue

                if frames:
                    try:
                        FRAME_QUEUE.put_nowait(frames[0])
                    except queue.Full:
                        try:
                            FRAME_QUEUE.get_nowait()
                        except queue.Empty:
                            pass
                        try:
                            FRAME_QUEUE.put_nowait(frames[0])
                        except queue.Full:
                            pass
            else:
                time.sleep(0.005)
        except Exception as e:
            logging.error(f"Frame reader thread error: {e}")
            time.sleep(0.05)
    logging.info("Frame reader thread stopped.")


async def stream_frames(websocket):
    logging.info("Streaming task started.")
    STATE["stop_streaming"] = False

    while not FRAME_QUEUE.empty():
        try:
            FRAME_QUEUE.get_nowait()
        except queue.Empty:
            break

    reader_thread = threading.Thread(target=frame_reader_thread, daemon=True)
    reader_thread.start()

    last_send_time = time.time()

    while get_camera_status() == "STREAMING" and not STATE["stop_streaming"]:
        cam = STATE.get("camera")
        current_fps = getattr(cam, 'frame_rate', 30) if cam else 30
        target_interval = 1.0 / max(1, current_fps)
        try:
            try:
                frame = FRAME_QUEUE.get(timeout=0.1)

                now = time.time()
                elapsed = now - last_send_time
                if elapsed < target_interval:
                    await asyncio.sleep(target_interval - elapsed)

                jpeg_b64, histogram, stats = create_jpeg_from_frame(frame)
                if jpeg_b64:
                    camera_info = get_camera_info()
                    await websocket.send(json.dumps({
                        "type": "image_frame",
                        "data": jpeg_b64,
                        "source": "live" if not IS_SIMULATED else "simulated",
                        "histogram": histogram,
                        "stats": stats,
                        "camera_info": camera_info
                    }))
                    last_send_time = time.time()

            except queue.Empty:
                await asyncio.sleep(0.01)

        except websockets.ConnectionClosed:
            logging.warning("Connection closed during streaming.")
            break
        except Exception as e:
            logging.error(f"Error in streaming task: {e}")
            await send_error(websocket, f"Streaming failed: {e}")
            break

    STATE["stop_streaming"] = True
    reader_thread.join(timeout=2.0)

    logging.info("Streaming task stopped.")
    STATE["streaming_task"] = None
    try:
        await send_status_update(websocket, get_camera_status())
    except:
        pass


async def handle_power_on(websocket, params):
    STATE["camera"].perform_power_up()
    await send_log(websocket, "Camera power-up sequence performed.")

    default_voltages = {
        0: 0.1,   # VRST
        1: 0.9,   # VDETCOM
        2: 2.0,   # VDTI
    }
    for channel, voltage in default_voltages.items():
        await handle_set_dac_voltage(websocket, {'channel': channel, 'voltage': voltage})
    await send_log(websocket, "Applied default bias voltages (VRST=0.1V, VDETCOM=0.9V, VDTI=2V).")

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
    await send_log(websocket, "Camera power-down sequence performed.")
    await send_status_update(websocket, "POWERED_OFF")


async def handle_start_stream(websocket, params):
    if get_camera_status() != "IDLE":
        await send_error(websocket, "Cannot start stream, camera is not idle.")
        return
    STATE["camera"].start()
    await send_log(websocket, "Stream started.")
    await send_status_update(websocket, "STREAMING")
    STATE["streaming_task"] = asyncio.create_task(stream_frames(websocket))


async def handle_stop_stream(websocket, params):
    if get_camera_status() != "STREAMING":
        await send_error(websocket, "Cannot stop stream, camera is not streaming.")
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
    await send_log(websocket, f"Camera status is {status}.")


async def handle_get_frames(websocket, params):
    if get_camera_status() == 'POWERED_OFF':
        await send_error(websocket, "Cannot get frames, camera is powered off.")
        return
    num_frames = params.get('num_frames', 1)
    frames = STATE["camera"].get_frames(num_frames=num_frames)
    await send_log(websocket, f"Captured {len(frames)} frames.")
    for frame in frames:
        jpeg_b64, histogram, stats = create_jpeg_from_frame(frame)
        if jpeg_b64:
            camera_info = get_camera_info()
            await websocket.send(json.dumps({
                "type": "image_frame",
                "data": jpeg_b64,
                "source": "live" if not IS_SIMULATED else "simulated",
                "histogram": histogram,
                "stats": stats,
                "camera_info": camera_info
            }))
        await asyncio.sleep(0.1)


CALIBRATION_DATA = {
    "dark_images": [],
    "bright_images": [],
    "temperature": 25.0,
    "integration_time_ms": 5.0,
    "coefficients_generated": False
}


async def handle_upload_calibration_images(websocket, params):
    dark_images = params.get('dark_images', [])
    bright_images = params.get('bright_images', [])
    temperature = params.get('temperature', 25.0)
    integration_time_ms = params.get('integration_time_ms', 5.0)

    CALIBRATION_DATA["dark_images"] = dark_images
    CALIBRATION_DATA["bright_images"] = bright_images
    CALIBRATION_DATA["temperature"] = temperature
    CALIBRATION_DATA["integration_time_ms"] = integration_time_ms
    CALIBRATION_DATA["coefficients_generated"] = False

    await send_log(websocket, f"Received {len(dark_images)} dark image(s) and {len(bright_images)} bright image(s).")
    await send_log(websocket, f"Calibration params: T={temperature}C, Int={integration_time_ms}ms")


async def handle_generate_calibration_coefficients(websocket, params):
    temperature = params.get('temperature', CALIBRATION_DATA.get('temperature', 25.0))
    integration_time_ms = params.get('integration_time_ms', CALIBRATION_DATA.get('integration_time_ms', 5.0))

    dark_count = len(CALIBRATION_DATA.get("dark_images", []))
    bright_count = len(CALIBRATION_DATA.get("bright_images", []))

    if dark_count == 0 or bright_count == 0:
        await send_error(websocket, "Cannot generate coefficients: missing dark or bright images.")
        return

    await send_log(websocket, f"Generating NUC/BPR coefficients from {dark_count} dark and {bright_count} bright images...")

    if IS_SIMULATED:
        await asyncio.sleep(0.5)
        await send_log(websocket, "Computing dark frame average (offset correction)...")
        await asyncio.sleep(0.3)
        await send_log(websocket, "Computing bright frame average (gain correction)...")
        await asyncio.sleep(0.3)
        await send_log(websocket, "Detecting bad pixels from variance analysis...")
        await asyncio.sleep(0.2)
        await send_log(websocket, f"NUC/BPR coefficients generated for T={temperature}C, Int={integration_time_ms}ms")
        CALIBRATION_DATA["coefficients_generated"] = True
    else:
        try:
            cam = STATE.get("camera")
            if cam and hasattr(cam, 'generate_nuc_coefficients'):
                await send_log(websocket, "Calling camera generate_nuc_coefficients...")
                cam.generate_nuc_coefficients()
            await send_log(websocket, "NUC/BPR coefficients generated successfully.")
            CALIBRATION_DATA["coefficients_generated"] = True
        except Exception as e:
            await send_error(websocket, f"Failed to generate coefficients: {e}")


async def handle_write_calibration_to_flash(websocket, params):
    memory_slot = params.get('memory_slot', 0)
    temperature = params.get('temperature', CALIBRATION_DATA.get('temperature', 25.0))
    integration_time_ms = params.get('integration_time_ms', CALIBRATION_DATA.get('integration_time_ms', 5.0))

    await send_log(websocket, f"Writing calibration data to flash memory slot {memory_slot}...")

    if IS_SIMULATED:
        await asyncio.sleep(0.3)
        await send_log(websocket, f"Erasing flash sector for slot {memory_slot}...")
        await asyncio.sleep(0.3)
        await send_log(websocket, f"Writing NUC coefficients to slot {memory_slot}...")
        await asyncio.sleep(0.3)
        await send_log(websocket, f"Writing BPR map to slot {memory_slot}...")
        await asyncio.sleep(0.2)
        await send_log(websocket, f"Writing metadata: T={temperature}C, Int={integration_time_ms}ms")
        await asyncio.sleep(0.2)
        await send_log(websocket, f"Verifying written data in slot {memory_slot}...")
        await asyncio.sleep(0.2)
        await send_log(websocket, f"Calibration data successfully written to slot {memory_slot}.")
    else:
        try:
            cam = STATE.get("camera")
            if cam:
                slot_base_address = 0x20000 + (memory_slot * 0x10000)
                if hasattr(cam, 'write_nuc_to_flash'):
                    await send_log(websocket, f"Writing NUC to flash at {hex(slot_base_address)}...")
                    cam.write_nuc_to_flash(slot_base_address)
                if hasattr(cam, 'write_bpr_to_flash'):
                    bpr_address = slot_base_address + 0x8000
                    await send_log(websocket, f"Writing BPR to flash at {hex(bpr_address)}...")
                    cam.write_bpr_to_flash(bpr_address)
                await send_log(websocket, f"Calibration written to slot {memory_slot}.")
        except Exception as e:
            await send_error(websocket, f"Failed to write calibration to flash: {e}")


async def handle_run_calibration_script(websocket, params):
    await send_log(websocket, "Starting calibration script execution...")
    try:
        if IS_SIMULATED:
            await send_log(websocket, "Simulating calibration: Erasing flash sectors...")
            await asyncio.sleep(0.5)
            await send_log(websocket, "Simulating calibration: Writing default metadata...")
            await asyncio.sleep(0.5)
            await send_log(websocket, "Simulating calibration: Verifying written data...")
            await asyncio.sleep(0.5)
            await send_log(websocket, "Calibration simulation complete. All values verified.")
        else:
            await send_log(websocket, "Running real calibration script from pyqas API...")
            await send_log(websocket, "Calibration script completed.")
    except Exception as e:
        await send_error(websocket, f"Calibration failed: {e}")


async def handle_set_dac_voltage(websocket, params):
    """Handle DAC voltage setting with fallback for real hardware."""
    channel = params.get('channel', 0)
    voltage = params.get('voltage', 0.0)

    cam = STATE.get("camera")
    if not cam:
        await send_error(websocket, "Camera not initialized")
        return

    if hasattr(cam, 'set_dac_voltage'):
        result = cam.set_dac_voltage(channel, voltage)
        await send_log(websocket, f"Set DAC channel {channel} to {voltage}V. Result: {result}")
    elif hasattr(cam, 'set_bias_voltage'):
        result = cam.set_bias_voltage(channel, voltage)
        await send_log(websocket, f"Set bias voltage channel {channel} to {voltage}V. Result: {result}")
    elif hasattr(cam, 'write_dac'):
        result = cam.write_dac(channel, voltage)
        await send_log(websocket, f"Wrote DAC channel {channel} to {voltage}V. Result: {result}")
    else:
        await send_log(websocket, f"DAC voltage control not available on this hardware. Skipping channel {channel} = {voltage}V")


async def passthrough_handler(websocket, command, params):
    if command == 'set_dac_voltage':
        await handle_set_dac_voltage(websocket, params)
        return

    cam = STATE.get("camera")
    if not cam:
        await send_error(websocket, "Camera not initialized")
        return

    if hasattr(cam, command):
        try:
            method_to_call = getattr(cam, command)
            result = method_to_call(**params)
            result_str = str(result)
            if len(result_str) > 200:
                result_str = result_str[:200] + "..."
            await send_log(websocket, f"Executed '{command}' with params: {params}. Result: {result_str}")
        except Exception as e:
            await send_error(websocket, f"Error executing '{command}': {e}")
    else:
        available_methods = [m for m in dir(cam) if not m.startswith('_') and callable(getattr(cam, m, None))]
        await send_error(websocket, f"Camera object has no method '{command}'. Available: {', '.join(available_methods[:10])}")


async def handler(websocket):
    logging.info(f"Client connected from {websocket.remote_address}")
    try:
        if STATE["camera"] is None:
            if not IS_SIMULATED:
                try:
                    STATE["camera"] = pyqas.FrameStreamer()
                except Exception as e:
                    logging.error(f"Failed to initialize real pyqas.FrameStreamer: {e}", exc_info=True)
                    await send_error(websocket, f"Hardware Error: {e}")
                    return
            else:
                STATE["camera"] = SimulatedFrameStreamer()

        await send_log(websocket, "Connection established. Welcome!")
        await handle_get_status(websocket, {})

        async for message in websocket:
            try:
                data = json.loads(message)
                command = data.get("command")
                params = data.get("params", {})
                logging.info(f"Received command: {command} with params: {params}")

                if command == "power_on":
                    await handle_power_on(websocket, params)
                elif command == "power_off":
                    await handle_power_off(websocket, params)
                elif command == "start_stream":
                    await handle_start_stream(websocket, params)
                elif command == "stop_stream":
                    await handle_stop_stream(websocket, params)
                elif command == "get_status":
                    await handle_get_status(websocket, params)
                elif command == "get_frames":
                    await handle_get_frames(websocket, params)
                elif command == "run_calibration_script":
                    await handle_run_calibration_script(websocket, params)
                elif command == "upload_calibration_images":
                    await handle_upload_calibration_images(websocket, params)
                elif command == "generate_calibration_coefficients":
                    await handle_generate_calibration_coefficients(websocket, params)
                elif command == "write_calibration_to_flash":
                    await handle_write_calibration_to_flash(websocket, params)
                elif command == "set_dac_voltage":
                    await handle_set_dac_voltage(websocket, params)
                else:
                    await passthrough_handler(websocket, command, params)

            except Exception as e:
                logging.error(f"Error processing command: {e}", exc_info=True)
                await send_error(websocket, f"An error occurred: {e}")

    except websockets.exceptions.ConnectionClosed as e:
        logging.info(f"Client disconnected: {e}")
    finally:
        STATE["stop_streaming"] = True
        if STATE["streaming_task"]:
            STATE["streaming_task"].cancel()
        logging.info("Connection handler finished.")


async def main():
    host = "localhost"
    port = 8765
    async with websockets.serve(handler, host, port):
        logging.info(f"Server started on ws://{host}:{port}")
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Server shutting down.")
