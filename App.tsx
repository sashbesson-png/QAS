
import React, { useState, useCallback, FC, useEffect, useRef } from 'react';
import { CameraIcon, CogIcon, BeakerIcon, ExclamationTriangleIcon, BoltIcon, StopIcon, PlayIcon, PowerIcon, WrenchScrewdriverIcon, VideoCameraIcon, ArrowDownTrayIcon } from './components/icons';
import { Section } from './components/Section';
import { ToggleButton } from './components/ToggleButton';
import { CommandOutput } from './components/CommandOutput';
import { StatusBar } from './components/StatusBar';
import type { CameraStatus, DacChannel, WsConnectionStatus, DacVoltages, ImageSourceType, CaptureFormat } from './types';
import { NumericInput } from './components/NumericInput';
import { ImageAnalysis } from './components/ImageAnalysis';
import { ImageViewer } from './components/ImageViewer';
import { Calibration } from './components/Calibration';
import { AdvancedControls } from './components/AdvancedControls';
import { Diagnostics } from './components/Diagnostics';
import { ErrorPanel } from './components/ErrorPanel';

const WEBSOCKET_URL = "ws://localhost:8765";

const App: FC = () => {
  const [lastCommand, setLastCommand] = useState<string>('app_init()');
  const [logs, setLogs] = useState<string[]>(['Welcome to SWIR Camera Control GUI.']);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('POWERED_OFF');
  const [wsStatus, setWsStatus] = useState<WsConnectionStatus>('CONNECTING');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageSourceType, setImageSourceType] = useState<ImageSourceType>('none');
  const [justConnected, setJustConnected] = useState<boolean>(false);
  const [frameRate, setFrameRate] = useState<number>(0);
  const [serverError, setServerError] = useState<string | null>(null);

  const websocket = useRef<WebSocket | null>(null);
  const frameCount = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);
  const recordedFramesRef = useRef<string[]>([]);
  const lastHistogramUpdate = useRef<number>(0);
  const lastStatsUpdate = useRef<number>(0);

  // Diagnostic State - use refs for high-frequency updates
  const totalMessagesRef = useRef(0);
  const framesReceivedRef = useRef(0);
  const statusUpdatesRef = useRef(0);
  const lastRawMessageRef = useRef('');
  const [diagnostics, setDiagnostics] = useState({ totalMessages: 0, framesReceived: 0, statusUpdates: 0, lastRawMessage: '' });

  // Settings State
  const [integrationTime, setIntegrationTime] = useState<number>(5.00);
  const [targetFrameRate, setTargetFrameRate] = useState<number>(30);
  const [columnSorting, setColumnSorting] = useState<boolean>(true);
  const [rowMirroring, setRowMirroring] = useState<boolean>(true);
  const [numFrames, setNumFrames] = useState<number>(10);
  const [captureFormat, setCaptureFormat] = useState<CaptureFormat>('avi');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedFrames, setRecordedFrames] = useState<string[]>([]);
  const [recordingFrameCount, setRecordingFrameCount] = useState<number>(0);
  const [capturedFrames, setCapturedFrames] = useState<string[]>([]);

  // Image Corrections State
  const [nucEnabled, setNucEnabled] = useState<boolean>(true);
  const [bprEnabled, setBprEnabled] = useState<boolean>(true);
  const [agcEnabled, setAgcEnabled] = useState<boolean>(false);
  const [agcMin, setAgcMin] = useState<number>(4000);
  const [agcMax, setAgcMax] = useState<number>(12000);
  const [aecEnabled, setAecEnabled] = useState<boolean>(true);
  const [aecLower, setAecLower] = useState<number>(3000);
  const [aecUpper, setAecUpper] = useState<number>(11000);
  const [aecFrames, setAecFrames] = useState<number>(4);

  // Default fixed voltages
  const defaultDacVoltages: DacVoltages = { 0: 0.1, 1: 0.9, 2: 2.0 };

  // Advanced State
  const [dacChannel, setDacChannel] = useState<DacChannel>(0);
  const [dacVoltages, setDacVoltages] = useState<DacVoltages>(defaultDacVoltages);
  const [registerAddress, setRegisterAddress] = useState<string>('0x08');
  const [registerValue, setRegisterValue] = useState<string>('0x00');
  const [fpgaRegisterAddress, setFpgaRegisterAddress] = useState<string>('0x01');
  const [fpgaRegisterValue, setFpgaRegisterValue] = useState<string>('0x100');
  const [flashAddress, setFlashAddress] = useState<string>('0x20000');

  // Analysis State
  const [histogramData, setHistogramData] = useState<number[]>([]);
  const [imageStats, setImageStats] = useState<{ min: number; max: number; mean: number } | null>(null);
  const [cameraTemperature, setCameraTemperature] = useState<number | null>(null);
  const [cameraIntegrationTime, setCameraIntegrationTime] = useState<number | null>(null);

  const addLog = useCallback((message: string, source: 'app' | 'server' = 'app') => {
    const prefix = source === 'server' ? '[Server]' : '[App]';
    setLogs(prev => [...prev.slice(-10), `${new Date().toLocaleTimeString()} ${prefix}: ${message}`]);
  }, []);

  const sendCommand = useCallback((command: string, params: Record<string, any> = {}) => {
    if (websocket.current?.readyState === WebSocket.OPEN) {
      setServerError(null); // Clear previous errors on new command
      const payload = JSON.stringify({ command, params });
      websocket.current.send(payload);
      const paramsString = Object.keys(params).length > 0 ? JSON.stringify(params) : '';
      setLastCommand(`${command}(${paramsString})`);
    } else {
      addLog('Cannot send command: WebSocket is not connected.', 'app');
    }
  }, [addLog]);

  useEffect(() => {
    function connect() {
      setWsStatus('CONNECTING');
      addLog(`Connecting to server at ${WEBSOCKET_URL}...`, 'app');
      const ws = new WebSocket(WEBSOCKET_URL);
      
      ws.onopen = () => {
        setWsStatus('CONNECTED');
        addLog('Successfully connected to the WebSocket server.', 'app');
        setJustConnected(true);
        setTimeout(() => setJustConnected(false), 800);
        // Proactively ask for the current status
        sendCommand('get_status');
        addLog('Requesting initial camera status...', 'app');
      };

      ws.onmessage = (event) => {
        totalMessagesRef.current++;
        lastRawMessageRef.current = event.data;
        const message = JSON.parse(event.data);
        const now = performance.now();

        switch (message.type) {
          case 'log':
            addLog(message.message, 'server');
            break;
          case 'status_update':
            statusUpdatesRef.current++;
            const newStatus = (message.status || '').toUpperCase();
            if (['POWERED_OFF', 'IDLE', 'STREAMING'].includes(newStatus)) {
                setCameraStatus(newStatus as CameraStatus);
                addLog(`Camera status updated to: ${newStatus}`, 'server');
            } else {
                addLog(`Received unknown camera status: '${message.status}'`, 'server');
            }
            if (message.camera_info) {
              if (message.camera_info.temperature !== null) {
                setCameraTemperature(message.camera_info.temperature);
              }
              if (message.camera_info.integration_time_ms !== null) {
                setCameraIntegrationTime(message.camera_info.integration_time_ms);
              }
            }
            break;
          case 'image_frame':
            framesReceivedRef.current++;
            const frameDataUrl = `data:image/jpeg;base64,${message.data}`;
            setImageSrc(frameDataUrl);
            setImageSourceType(message.source || 'simulated');

            // Throttle histogram updates to max 10Hz
            if (message.histogram && now - lastHistogramUpdate.current > 100) {
              setHistogramData(message.histogram);
              lastHistogramUpdate.current = now;
            }

            // Throttle stats updates to max 10Hz
            if (message.stats && now - lastStatsUpdate.current > 100) {
              setImageStats(message.stats);
            }

            // Update camera info less frequently (only when changed)
            if (message.camera_info) {
              if (message.camera_info.temperature !== null) {
                setCameraTemperature(message.camera_info.temperature);
              }
              if (message.camera_info.integration_time_ms !== null) {
                setCameraIntegrationTime(message.camera_info.integration_time_ms);
              }
              if (message.camera_info.frame_rate !== undefined) {
                setTargetFrameRate(message.camera_info.frame_rate);
              }
            }

            // Use ref for recording to avoid setState on every frame
            if (isRecordingRef.current) {
              recordedFramesRef.current.push(frameDataUrl);
            }
            frameCount.current++;
            break;
          case 'error':
            const errorMessage = message.message || 'An unknown error occurred on the server.';
            setServerError(errorMessage);
            addLog(`ERROR from server: ${errorMessage}`, 'server');
            break;
          default:
            addLog(`Received unknown message type: ${message.type}`, 'server');
        }
      };

      ws.onclose = (event: CloseEvent) => {
        setWsStatus('DISCONNECTED');
        setCameraStatus('POWERED_OFF'); // Reset status on disconnect for clarity
        setImageSourceType('none');
        let reason = '';
        if (event.code === 1006) {
            reason = 'Connection failed. Please ensure the Python server is running.';
        } else if (event.reason) {
            reason = `Reason: ${event.reason} (Code: ${event.code})`;
        } else {
            reason = `Connection closed unexpectedly (Code: ${event.code})`;
        }
        addLog(`${reason} Reconnecting in 5 seconds...`, 'app');
        setTimeout(connect, 5000);
      };
      
      ws.onerror = () => {
        addLog('WebSocket connection error. The server may be unreachable.', 'app');
        // The native WebSocket 'error' event doesn't provide specific details.
        // The 'close' event that follows is more informative.
        console.error('WebSocket error. This typically means the connection to the server at ' + WEBSOCKET_URL + ' could not be established.');
      };
      
      websocket.current = ws;
    }

    connect();

    return () => {
      if (websocket.current) {
          websocket.current.onclose = null;
          websocket.current.close();
      }
    };
  }, [addLog, sendCommand]);

  useEffect(() => {
    const interval = setInterval(() => {
        setFrameRate(frameCount.current);
        frameCount.current = 0;
        // Update diagnostics state periodically (1Hz) instead of every message
        setDiagnostics({
          totalMessages: totalMessagesRef.current,
          framesReceived: framesReceivedRef.current,
          statusUpdates: statusUpdatesRef.current,
          lastRawMessage: lastRawMessageRef.current
        });
        // Update recording frame count display
        if (isRecordingRef.current) {
          setRecordingFrameCount(recordedFramesRef.current.length);
        }
    }, 1000);
    return () => clearInterval(interval);
  }, []);


  // Command Handlers
  const handlePower = (on: boolean) => {
    if (on) {
      sendCommand('power_on');
      // After powering on, apply the fixed default bias voltages.
      setTimeout(() => {
        sendCommand('set_dac_voltage', { channel: 0, voltage: defaultDacVoltages[0] });
        sendCommand('set_dac_voltage', { channel: 1, voltage: defaultDacVoltages[1] });
        sendCommand('set_dac_voltage', { channel: 2, voltage: defaultDacVoltages[2] });
        setDacVoltages(defaultDacVoltages); // Also reset UI state
        addLog('Applied default bias voltages.', 'app');
      }, 100);
    } else {
      sendCommand('power_off');
    }
  };
  const handleStreaming = (start: boolean) => sendCommand(start ? 'start_stream' : 'stop_stream');
  
  const handleSetIntegrationTime = (value: number) => {
    setIntegrationTime(value);
    sendCommand('set_integration_time', { integration_time: Math.round(value * 100_000) });
  };

  const handleSetFrameRate = (value: number) => {
    setTargetFrameRate(value);
    sendCommand('set_frame_rate', { frame_rate: value });
  };
  
  const handleNucToggle = (enabled: boolean) => {
    setNucEnabled(enabled);
    sendCommand('enable_nuc', { enable: enabled });
  };
  const handleBprToggle = (enabled: boolean) => {
      setBprEnabled(enabled);
      sendCommand('enable_bpr', { enable: enabled });
  };
  const handleAecToggle = (enabled: boolean) => {
      setAecEnabled(enabled);
      sendCommand('enable_aec', { enable: enabled });
  };
  const handleAgcToggle = (enabled: boolean) => {
      setAgcEnabled(enabled);
      sendCommand('enable_agc', { enable: enabled });
  };
  const handleApplyAec = () => {
      sendCommand('configure_aec', {
          lower_limit: aecLower,
          upper_limit: aecUpper,
          num_frames_to_average: aecFrames,
      });
  };
  const handleApplyAgc = () => {
      sendCommand('configure_agc', {
          min_target_value: agcMin,
          max_target_value: agcMax,
      });
  };

  const handleColumnSortingToggle = (enabled: boolean) => {
      setColumnSorting(enabled);
      sendCommand('set_column_sorting', { enable: enabled });
  };
  const handleRowMirroringToggle = (enabled: boolean) => {
      setRowMirroring(enabled);
      sendCommand('set_row_mirroring', { enable: enabled });
  };

  const handleGetFrames = () => {
      setCapturedFrames([]);
      sendCommand('get_frames', { num_frames: numFrames });
  };

  const handleSaveCurrentFrame = () => {
    if (!imageSrc) {
      addLog('No frame to save.', 'app');
      return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `frame_${timestamp}.${captureFormat === 'jpeg' ? 'jpg' : captureFormat}`;

    const downloadFile = (dataUrl: string, name: string) => {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addLog(`Saved frame as ${captureFormat.toUpperCase()}`, 'app');
    };

    if (captureFormat === 'jpeg') {
      downloadFile(imageSrc, filename);
    } else {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const mimeType = captureFormat === 'png' ? 'image/png' : 'image/png';
          downloadFile(canvas.toDataURL(mimeType), filename);
        }
      };
      img.onerror = () => {
        addLog('Failed to process image for saving.', 'app');
      };
      img.src = imageSrc;
    }
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      isRecordingRef.current = false;
      setIsRecording(false);
      // Sync ref to state when recording stops
      setRecordedFrames([...recordedFramesRef.current]);
      addLog(`Recording stopped. ${recordedFramesRef.current.length} frames captured.`, 'app');
    } else {
      recordedFramesRef.current = [];
      setRecordedFrames([]);
      isRecordingRef.current = true;
      setIsRecording(true);
      addLog('Recording started...', 'app');
    }
  };

  const handleSaveRecording = async () => {
    const frames = recordedFramesRef.current.length > 0 ? recordedFramesRef.current : recordedFrames;
    if (frames.length === 0) {
      addLog('No frames to save.', 'app');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    const downloadFile = (dataUrl: string, name: string) => {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    for (let i = 0; i < frames.length; i++) {
      const frameNum = String(i + 1).padStart(4, '0');
      const filename = `recording_${timestamp}_frame${frameNum}.${captureFormat === 'jpeg' ? 'jpg' : captureFormat}`;

      if (captureFormat === 'jpeg') {
        downloadFile(frames[i], filename);
      } else {
        await new Promise<void>((resolve) => {
          const img = new window.Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              const mimeType = captureFormat === 'png' ? 'image/png' : 'image/png';
              downloadFile(canvas.toDataURL(mimeType), filename);
            }
            resolve();
          };
          img.onerror = () => resolve();
          img.src = frames[i];
        });
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    addLog(`Saved ${frames.length} frames as ${captureFormat.toUpperCase()}`, 'app');
  };

  const isConnected = wsStatus === 'CONNECTED';

  return (
    <div className="min-h-screen bg-gray-900 font-sans text-gray-200 p-4 lg:p-6">
      {wsStatus !== 'CONNECTED' && (
         <div className="fixed inset-0 bg-black/70 z-50 flex flex-col items-center justify-center text-center p-4 backdrop-blur-sm">
            <h2 className="text-3xl font-bold text-red-400 mb-4">Connection Lost</h2>
            <p className="text-lg text-gray-300">Could not connect to the local Python server.</p>
            <p className="mt-2 text-sm text-gray-400">Please ensure the `server.py` script is running on your machine.</p>
            <div className="mt-6 p-4 bg-gray-800 rounded-lg font-mono text-left text-cyan-300 shadow-lg">
                <p className="text-gray-400 select-none">$ # First install dependencies</p>
                <p>$ pip install websockets numpy Pillow pyqas</p>
                <p className="mt-2 text-gray-400 select-none">$ # Then run the server</p>
                <p>$ python server.py</p>
            </div>
         </div> 
      )}
      <div className={`max-w-7xl mx-auto ${wsStatus !== 'CONNECTED' ? 'blur-sm' : ''}`}>
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CameraIcon className="w-8 h-8 text-cyan-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">SWIR Camera Control</h1>
          </div>
          <StatusBar status={cameraStatus} wsStatus={wsStatus} temperature={cameraTemperature} frameRate={frameRate} justConnected={justConnected} integrationTime={cameraIntegrationTime} />
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {serverError && (
              <div className="lg:col-span-3">
                  <ErrorPanel message={serverError} onClose={() => setServerError(null)} />
              </div>
          )}
          <div className="lg:col-span-2">
            <Section title="Camera Control" icon={<BoltIcon />}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <button onClick={() => handlePower(true)} disabled={!isConnected || cameraStatus !== 'POWERED_OFF'} className="flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-md">
                    <PowerIcon className="w-5 h-5" /><span>Power On</span>
                  </button>
                  <button onClick={() => handlePower(false)} disabled={!isConnected || cameraStatus === 'POWERED_OFF'} className="flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-md">
                    <PowerIcon className="w-5 h-5" /><span>Power Off</span>
                  </button>
                  <button onClick={() => handleStreaming(true)} disabled={!isConnected || cameraStatus !== 'IDLE'} className="flex items-center justify-center space-x-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-md">
                     <PlayIcon className="w-5 h-5" /><span>Start Stream</span>
                  </button>
                   <button onClick={() => handleStreaming(false)} disabled={!isConnected || cameraStatus !== 'STREAMING'} className="flex items-center justify-center space-x-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-md">
                    <StopIcon className="w-5 h-5" /><span>Stop Stream</span>
                  </button>
                </div>
            </Section>
          </div>
          
          <div className="lg:col-span-1">
             <CommandOutput command={lastCommand} />
          </div>

          <div className="lg:col-span-2 flex flex-col space-y-6">
            <ImageViewer imageSrc={imageSrc} sourceType={imageSourceType} />
            <Section title="Image Corrections" icon={<BeakerIcon />}>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="border border-gray-700 rounded-lg p-4">
                        <h3 className="font-semibold text-lg text-cyan-300 mb-3">Auto Exposure Control (AEC)</h3>
                        <ToggleButton label="Enable AEC" enabled={aecEnabled} onChange={handleAecToggle} />
                        <div className="grid grid-cols-3 gap-4 mt-3">
                           <NumericInput label="Lower" value={aecLower} onChange={setAecLower} min={0} max={16383} />
                           <NumericInput label="Upper" value={aecUpper} onChange={setAecUpper} min={0} max={16383} />
                           <NumericInput label="Frames" value={aecFrames} onChange={setAecFrames} min={0} max={255} />
                        </div>
                        <button onClick={handleApplyAec} className="w-full mt-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-1.5 px-4 rounded-lg text-sm transition-colors" disabled={!isConnected}>Apply AEC</button>
                   </div>
                   <div className="border border-gray-700 rounded-lg p-4">
                        <h3 className="font-semibold text-lg text-cyan-300 mb-3">Auto Gain Control (AGC)</h3>
                        <ToggleButton label="Enable AGC" enabled={agcEnabled} onChange={handleAgcToggle} />
                        <div className="grid grid-cols-2 gap-4 mt-3">
                          <NumericInput label="Min Target" value={agcMin} onChange={setAgcMin} min={0} max={16383} />
                          <NumericInput label="Max Target" value={agcMax} onChange={setAgcMax} min={0} max={16383} />
                        </div>
                        <button onClick={handleApplyAgc} className="w-full mt-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-1.5 px-4 rounded-lg text-sm transition-colors" disabled={!isConnected}>Apply AGC</button>
                   </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="border border-gray-700 rounded-lg p-4">
                    <ToggleButton label="Non-Uniform Correction (NUC)" enabled={nucEnabled} onChange={handleNucToggle} />
                   </div>
                   <div className="border border-gray-700 rounded-lg p-4">
                    <ToggleButton label="Bad Pixel Replacement (BPR)" enabled={bprEnabled} onChange={handleBprToggle} />
                   </div>
                </div>
              </div>
            </Section>
            
            <Section title="NUC & BPR Calibration" icon={<WrenchScrewdriverIcon className="w-6 h-6" />}>
                <Calibration sendCommand={sendCommand} isConnected={isConnected} />
            </Section>
            <Section title="Advanced" icon={<ExclamationTriangleIcon />} defaultOpen={false}>
              <AdvancedControls
                dacChannel={dacChannel}
                setDacChannel={setDacChannel}
                dacVoltages={dacVoltages}
                setDacVoltages={setDacVoltages}
                registerAddress={registerAddress}
                setRegisterAddress={setRegisterAddress}
                registerValue={registerValue}
                setRegisterValue={setRegisterValue}
                fpgaRegisterAddress={fpgaRegisterAddress}
                setFpgaRegisterAddress={setFpgaRegisterAddress}
                fpgaRegisterValue={fpgaRegisterValue}
                setFpgaRegisterValue={setFpgaRegisterValue}
                flashAddress={flashAddress}
                setFlashAddress={setFlashAddress}
                sendCommand={sendCommand}
                isConnected={isConnected}
              />
            </Section>
          </div>

          <div className="lg:col-span-1 flex flex-col space-y-6">
            <ImageAnalysis histogramData={histogramData} sourceType={imageSourceType} serverStats={imageStats} />
            <Section title="Image Settings" icon={<CogIcon />}>
                <div className="space-y-6">
                  <div className="flex flex-col">
                      <div className="flex justify-between items-center mb-1">
                        <label htmlFor="integrationTime" className="text-sm font-medium text-gray-400">Integration Time (ms)</label>
                        {aecEnabled && cameraIntegrationTime !== null && (
                          <span className="text-xs text-cyan-400 font-medium">AEC Active</span>
                        )}
                      </div>
                      <input type="range" id="integrationTime" min="0.01" max="100.00" step="0.01" value={integrationTime} onChange={(e) => setIntegrationTime(Number(e.target.value))} onMouseUp={(e) => handleSetIntegrationTime(Number(e.currentTarget.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" disabled={!isConnected || aecEnabled} />
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-gray-500">Set: {integrationTime.toFixed(2)} ms</span>
                        <span className={`text-sm font-medium ${aecEnabled ? 'text-cyan-300' : 'text-white'}`}>
                          Actual: {cameraIntegrationTime !== null ? cameraIntegrationTime.toFixed(2) : '--'} ms
                        </span>
                      </div>
                  </div>
                  <div className="flex flex-col">
                      <label htmlFor="frameRate" className="text-sm font-medium text-gray-400 mb-1">Target Frame Rate (FPS)</label>
                      <input type="range" id="frameRate" min="1" max="60" step="1" value={targetFrameRate} onChange={(e) => setTargetFrameRate(Number(e.target.value))} onMouseUp={(e) => handleSetFrameRate(Number(e.currentTarget.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" disabled={!isConnected} />
                      <span className="text-center text-sm mt-1">{targetFrameRate} FPS</span>
                  </div>
                   <div className="flex justify-around pt-4 border-t border-gray-700">
                      <ToggleButton label="Column Sorting" enabled={columnSorting} onChange={handleColumnSortingToggle} />
                      <ToggleButton label="Row Mirroring" enabled={rowMirroring} onChange={handleRowMirroringToggle} />
                  </div>
                </div>
            </Section>
            
            <Section title="Frame Capture & Recording" icon={<CameraIcon />}>
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <label className="text-sm font-medium text-gray-400 whitespace-nowrap">Format:</label>
                  <select
                    value={captureFormat}
                    onChange={(e) => setCaptureFormat(e.target.value as CaptureFormat)}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="png">PNG (Lossless)</option>
                    <option value="jpeg">JPEG (Compressed)</option>
                    <option value="tiff">TIFF (High Quality)</option>
                  </select>
                </div>

                <div className="border-t border-gray-700 pt-4">
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Single Frame</h4>
                  <button
                    onClick={handleSaveCurrentFrame}
                    disabled={!imageSrc}
                    className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-md"
                  >
                    <ArrowDownTrayIcon className="w-5 h-5" />
                    <span>Save Current Frame</span>
                  </button>
                </div>

                <div className="border-t border-gray-700 pt-4">
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Multi-Frame Capture</h4>
                  <div className="flex items-center space-x-3 mb-3">
                    <NumericInput label="Frames" value={numFrames} onChange={setNumFrames} min={1} max={100} />
                    <button onClick={handleGetFrames} disabled={!isConnected || cameraStatus !== 'IDLE'} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-md">
                      Get Frames
                    </button>
                  </div>
                </div>

                <div className="border-t border-gray-700 pt-4">
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Video Recording</h4>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={handleToggleRecording}
                      disabled={!isConnected || cameraStatus !== 'STREAMING'}
                      className={`flex-1 flex items-center justify-center space-x-2 font-semibold py-2 px-4 rounded-lg transition-colors shadow-md ${
                        isRecording
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white'
                      }`}
                    >
                      <VideoCameraIcon className="w-5 h-5" />
                      <span>{isRecording ? 'Stop Recording' : 'Start Recording'}</span>
                    </button>
                    <button
                      onClick={handleSaveRecording}
                      disabled={recordedFrames.length === 0}
                      className="flex items-center justify-center space-x-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-md"
                    >
                      <ArrowDownTrayIcon className="w-5 h-5" />
                      <span>Save</span>
                    </button>
                  </div>
                  {isRecording && (
                    <div className="mt-2 flex items-center space-x-2">
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                      <span className="text-sm text-red-400">Recording: {recordingFrameCount} frames</span>
                    </div>
                  )}
                  {!isRecording && recordedFrames.length > 0 && (
                    <p className="mt-2 text-sm text-gray-400">{recordedFrames.length} frames ready to save</p>
                  )}
                </div>
              </div>
            </Section>
            
            <Diagnostics
                totalMessages={diagnostics.totalMessages}
                framesReceived={diagnostics.framesReceived}
                statusUpdates={diagnostics.statusUpdates}
                lastRawMessage={diagnostics.lastRawMessage}
            />

            <div className="bg-gray-800 rounded-lg shadow-inner flex-grow flex flex-col">
              <h2 className="text-lg font-semibold p-4 border-b border-gray-700 text-gray-200">Event Log</h2>
              <div className="p-4 space-y-1 overflow-y-auto h-64">
                {logs.map((log, i) => (
                  <p key={i} className="text-xs text-gray-400 font-mono break-words">{log}</p>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
