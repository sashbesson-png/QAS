
import React, { useState, useCallback, FC, useEffect, useRef } from 'react';
import { CameraIcon, CogIcon, BeakerIcon, ExclamationTriangleIcon, BoltIcon, StopIcon, PlayIcon, PowerIcon, WrenchScrewdriverIcon } from './components/icons';
import { Section } from './components/Section';
import { ToggleButton } from './components/ToggleButton';
import { CommandOutput } from './components/CommandOutput';
import { StatusBar } from './components/StatusBar';
import type { CameraStatus, DacChannel, WsConnectionStatus, DacVoltages, ImageSourceType } from './types';
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

  // Diagnostic State
  const [totalMessages, setTotalMessages] = useState(0);
  const [framesReceived, setFramesReceived] = useState(0);
  const [statusUpdates, setStatusUpdates] = useState(0);
  const [lastRawMessage, setLastRawMessage] = useState('');

  // Settings State
  const [integrationTime, setIntegrationTime] = useState<number>(5.00);
  const [targetFrameRate, setTargetFrameRate] = useState<number>(30); // Kept for display, but control is disabled
  const [columnSorting, setColumnSorting] = useState<boolean>(true);
  const [rowMirroring, setRowMirroring] = useState<boolean>(false);
  const [numFrames, setNumFrames] = useState<number>(10);

  // Image Corrections State
  const [nucEnabled, setNucEnabled] = useState<boolean>(true);
  const [bprEnabled, setBprEnabled] = useState<boolean>(true);
  const [agcEnabled, setAgcEnabled] = useState<boolean>(true);
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
        setTotalMessages(prev => prev + 1);
        setLastRawMessage(event.data);
        const message = JSON.parse(event.data);
        switch (message.type) {
          case 'log':
            addLog(message.message, 'server');
            break;
          case 'status_update':
            setStatusUpdates(prev => prev + 1);
            const newStatus = (message.status || '').toUpperCase();
            if (['POWERED_OFF', 'IDLE', 'STREAMING'].includes(newStatus)) {
                setCameraStatus(newStatus as CameraStatus);
                addLog(`Camera status updated to: ${newStatus}`, 'server');
            } else {
                addLog(`Received unknown camera status: '${message.status}'`, 'server');
            }
            break;
          case 'image_frame':
            setFramesReceived(prev => prev + 1);
            setImageSrc(`data:image/jpeg;base64,${message.data}`);
            setImageSourceType(message.source || 'simulated');
            if (message.histogram) {
              setHistogramData(message.histogram);
            }
            if (message.stats) {
              setImageStats(message.stats);
            }
            if (message.camera_info) {
              if (message.camera_info.temperature !== null) {
                setCameraTemperature(message.camera_info.temperature);
              }
              if (message.camera_info.integration_time_ms !== null) {
                setCameraIntegrationTime(message.camera_info.integration_time_ms);
              }
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
    // As per docs, integration time is in units of 10ns. 1ms = 100,000 units.
    sendCommand('set_integration_time', { integration_time: Math.round(value * 100_000) });
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
      sendCommand('get_frames', { num_frames: numFrames });
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                 <div className="space-y-4 border-r border-gray-700 pr-8">
                    <h3 className="font-semibold text-lg text-cyan-300">Corrections</h3>
                    <ToggleButton label="Non-Uniform Correction (NUC)" enabled={nucEnabled} onChange={handleNucToggle} />
                    <ToggleButton label="Bad Pixel Replacement (BPR)" enabled={bprEnabled} onChange={handleBprToggle} />
                </div>
                <div className="space-y-6">
                   <div>
                        <h3 className="font-semibold text-lg text-cyan-300 mb-2">Auto Exposure Control (AEC)</h3>
                        <ToggleButton label="Enable AEC" enabled={aecEnabled} onChange={handleAecToggle} />
                        <div className="grid grid-cols-3 gap-4 mt-2">
                           <NumericInput label="Lower" value={aecLower} onChange={setAecLower} min={0} max={16383} />
                           <NumericInput label="Upper" value={aecUpper} onChange={setAecUpper} min={0} max={16383} />
                           <NumericInput label="Frames" value={aecFrames} onChange={setAecFrames} min={0} max={255} />
                        </div>
                        <button onClick={handleApplyAec} className="w-full mt-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white font-semibold py-1.5 px-4 rounded-lg text-sm transition-colors" disabled={!isConnected}>Apply AEC</button>
                   </div>
                   <div>
                        <h3 className="font-semibold text-lg text-cyan-300 mb-2">Auto Gain Control (AGC)</h3>
                        <ToggleButton label="Enable AGC" enabled={agcEnabled} onChange={handleAgcToggle} />
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          <NumericInput label="Min Target" value={agcMin} onChange={setAgcMin} min={0} max={16383} />
                          <NumericInput label="Max Target" value={agcMax} onChange={setAgcMax} min={0} max={16383} />
                        </div>
                        <button onClick={handleApplyAgc} className="w-full mt-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white font-semibold py-1.5 px-4 rounded-lg text-sm transition-colors" disabled={!isConnected}>Apply AGC</button>
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
                      <label htmlFor="integrationTime" className="text-sm font-medium text-gray-400 mb-1">Integration Time (ms)</label>
                      <input type="range" id="integrationTime" min="0.01" max="100.00" step="0.01" value={integrationTime} onChange={(e) => setIntegrationTime(Number(e.target.value))} onMouseUp={(e) => handleSetIntegrationTime(Number(e.currentTarget.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" disabled={!isConnected} />
                      <span className="text-center text-sm mt-1">{integrationTime.toFixed(2)} ms</span>
                  </div>
                   <div className="flex flex-col opacity-50">
                      <label htmlFor="frameRate" className="text-sm font-medium text-gray-400 mb-1">Target Frame Rate (Not Adjustable)</label>
                      <input type="range" id="frameRate" min="1" max="60" step="1" value={targetFrameRate} onChange={(e) => setTargetFrameRate(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-not-allowed" disabled={true} />
                      <span className="text-center text-sm mt-1">{targetFrameRate} FPS</span>
                  </div>
                   <div className="flex justify-around pt-4 border-t border-gray-700">
                      <ToggleButton label="Column Sorting" enabled={columnSorting} onChange={handleColumnSortingToggle} />
                      <ToggleButton label="Row Mirroring" enabled={rowMirroring} onChange={handleRowMirroringToggle} />
                  </div>
                </div>
            </Section>
            
            <Section title="Frame Capture" icon={<CameraIcon />}>
              <div className="flex items-center space-x-4">
                <NumericInput label="Frames" value={numFrames} onChange={setNumFrames} min={1} max={100} />
                <button onClick={handleGetFrames} disabled={!isConnected || cameraStatus !== 'IDLE'} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-md">
                  Get Frames
                </button>
              </div>
            </Section>
            
            <Diagnostics
                totalMessages={totalMessages}
                framesReceived={framesReceived}
                statusUpdates={statusUpdates}
                lastRawMessage={lastRawMessage}
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
