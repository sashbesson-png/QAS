import React, { FC, useState } from 'react';
import { CheckCircleIcon, ExclamationCircleIcon, ArrowPathIcon } from './icons';

interface CalibrationProps {
  sendCommand: (command: string, params?: Record<string, any>) => void;
  isConnected: boolean;
}

type CalibrationStatus = 'idle' | 'processing' | 'complete' | 'error';

export const Calibration: FC<CalibrationProps> = ({ sendCommand, isConnected }) => {
    const [status, setStatus] = useState<CalibrationStatus>('idle');
    const [progressMessage, setProgressMessage] = useState('');
    
    const isProcessing = status === 'processing';

    const handleCalibration = async () => {
        setStatus('processing');
        setProgressMessage('Executing calibration script on server... See Event Log for details.');
        sendCommand('run_calibration_script');

        // Since the process is long and happens on the server, we'll just provide feedback
        // and reset the UI after a timeout. The user can see the detailed progress in the log.
        setTimeout(() => {
            // A simple heuristic to guess completion. A more robust solution would
            // involve a completion message from the server.
            if (status === 'processing') {
                setStatus('complete');
                setProgressMessage('Calibration script execution requested. Check logs for verification.');
            }
        }, 10000); // 10 seconds for the operation to run

        setTimeout(() => {
            setStatus('idle');
            setProgressMessage('');
        }, 15000); // Reset UI after 15 seconds
    };
    
    const StatusIcon: FC = () => {
        switch(status) {
            case 'processing': return <ArrowPathIcon className="w-5 h-5 text-cyan-400 animate-spin" />;
            case 'complete': return <CheckCircleIcon className="w-5 h-5 text-green-400" />;
            case 'error': return <ExclamationCircleIcon className="w-5 h-5 text-red-400" />;
            default: return null;
        }
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-400 leading-relaxed">
                This action runs the calibration demo script from the pyqas API documentation (p. 104). It performs a full erase, write, and verify cycle for the default calibration metadata (flag, temperatures, integration times, and illumination values) stored in the camera's flash memory.
            </p>
            
            <button 
                onClick={handleCalibration}
                disabled={isProcessing || !isConnected}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg transition-colors shadow-md flex items-center justify-center space-x-2"
            >
                {isProcessing ? <span>Executing Script...</span> : <span>Write & Verify Default Calibration Data</span>}
            </button>
            
            {progressMessage && (
                <div className="flex items-center justify-center space-x-3 p-3 bg-gray-900/50 rounded-md text-sm text-gray-300">
                    <StatusIcon />
                    <span>{progressMessage}</span>
                </div>
            )}
        </div>
    );
};
