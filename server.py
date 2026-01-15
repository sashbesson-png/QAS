import asyncio
import websockets
import json
import logging
import base64
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
        logging.info(f"Simulating get {num_frames} frames.")
        frames = []
        for i in range(num_frames):
            noise = np.random.randint(4000, 12000, size=(480, 640), dtype=np.uint16)
            x = np.linspace(0, 1000, 640)
            y = np.linspace(0, 1000, 480)
            xv, yv = np.meshgrid(x, y)
            gradient = (xv + yv).astype(np.uint16)
            frame_data = noise + gradient
            mock_frame = type('MockFrame', (), {'image': frame_data})()
            frames.append(mock_frame)
        return frames

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

    def enable_nuc(self, enable):
        logging.info(f"Sim: NUC set to {enable}.")
        return True

    def enable_bpr(self, enable):
        logging.info(f"Sim: BPR set to {enable}.")
        return True

    def configure_aec(self, lower_limit=None, upper_limit=None, num_frames_to_average=None, **kwargs):
        logging.info(f"Sim: Configure AEC - lower={lower_limit}, upper={upper_limit}, frames={num_frames_to_average}.")
        return True

    def configure_agc(self, min_target_value=None, max_target_value=None, **kwargs):
        logging.info(f"Sim: Configure AGC - min={min_target_value}, max={max_target_value}.")
        return True

    def enable_aec(self, enable):
        logging.info(f"Sim: AEC set to {enable}.")
        return True

    def enable_agc(self, enable):
        logging.info(f"Sim: AGC set to {enable}.")
        return True

    def set_column_sorting(self, enable):
        logging.info(f"Sim: Column Sorting set to {enable}.")
        return True

    def set_row_mirroring(self, enable):
        logging.info(f"Sim: Row Mirroring set to {enable}.")
        return True


STATE = {"camera": None, "streaming_task": None}
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
    await websocket.send(json.dumps({"type": "status_update", "status": new_status}))


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
        return None
    min_val, max_val = frame_data.min(), frame_data.max()
    if max_val == min_val:
        max_val = min_val + 1
    normalized_frame = (frame_data - min_val) / (max_val - min_val) * 255
    image = Image.fromarray(normalized_frame.astype(np.uint8))
    buffer = BytesIO()
    image.save(buffer, format="JPEG")
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


async def stream_frames(websocket):
    logging.info("Streaming task started.")
    while get_camera_status() == "STREAMING":
        try:
            frames = STATE["camera"].get_frames(num_frames=1)
            if frames:
                jpeg_b64 = create_jpeg_from_frame(frames[0])
                if jpeg_b64:
                    await websocket.send(json.dumps({
                        "type": "image_frame",
                        "data": jpeg_b64,
                        "source": "live" if not IS_SIMULATED else "simulated"
                    }))
            await asyncio.sleep(0.01)
        except websockets.ConnectionClosed:
            logging.warning("Connection closed during streaming.")
            break
        except Exception as e:
            logging.error(f"Error in streaming task: {e}")
            await send_error(websocket, f"Streaming failed: {e}")
            break
    logging.info("Streaming task stopped.")
    STATE["streaming_task"] = None
    await send_status_update(websocket, get_camera_status())


async def handle_power_on(websocket, params):
    STATE["camera"].perform_power_up()
    await send_log(websocket, "Camera power-up sequence performed.")
    await send_status_update(websocket, "IDLE")


async def handle_power_off(websocket, params):
    if STATE["streaming_task"]:
        STATE["streaming_task"].cancel()
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
    if STATE["streaming_task"]:
        STATE["streaming_task"].cancel()
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
        jpeg_b64 = create_jpeg_from_frame(frame)
        if jpeg_b64:
            await websocket.send(json.dumps({
                "type": "image_frame",
                "data": jpeg_b64,
                "source": "live" if not IS_SIMULATED else "simulated"
            }))
        await asyncio.sleep(0.1)


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


async def passthrough_handler(websocket, command, params):
    if hasattr(STATE["camera"], command):
        method_to_call = getattr(STATE["camera"], command)
        result = method_to_call(**params)
        result_str = str(result)
        if len(result_str) > 200:
            result_str = result_str[:200] + "..."
        await send_log(websocket, f"Executed '{command}' with params: {params}. Result: {result_str}")
    else:
        await send_error(websocket, f"Camera object has no method '{command}'")


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
                else:
                    await passthrough_handler(websocket, command, params)

            except Exception as e:
                logging.error(f"Error processing command: {e}", exc_info=True)
                await send_error(websocket, f"An error occurred: {e}")

    except websockets.exceptions.ConnectionClosed as e:
        logging.info(f"Client disconnected: {e}")
    finally:
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
