import React, { FC, useState, useRef } from 'react';
import { CheckCircleIcon, ExclamationCircleIcon, ArrowPathIcon, TrashIcon, DocumentArrowUpIcon } from './icons';
import { NumericInput } from './NumericInput';

interface CalibrationProps {
  sendCommand: (command: string, params?: Record<string, any>) => void;
  isConnected: boolean;
}

type CalibrationStep = 'idle' | 'uploading' | 'generating' | 'writing' | 'complete' | 'error';

interface ImageFile {
  name: string;
  data: string;
}

export const Calibration: FC<CalibrationProps> = ({ sendCommand, isConnected }) => {
    const [step, setStep] = useState<CalibrationStep>('idle');
    const [statusMessage, setStatusMessage] = useState('');

    const [darkImages, setDarkImages] = useState<ImageFile[]>([]);
    const [brightImages, setBrightImages] = useState<ImageFile[]>([]);

    const [temperature, setTemperature] = useState<number>(25.0);
    const [integrationTime, setIntegrationTime] = useState<number>(5.0);
    const [memorySlot, setMemorySlot] = useState<number>(0);

    const darkInputRef = useRef<HTMLInputElement>(null);
    const brightInputRef = useRef<HTMLInputElement>(null);

    const isProcessing = step === 'uploading' || step === 'generating' || step === 'writing';

    const handleFileSelect = async (
        files: FileList | null,
        setImages: React.Dispatch<React.SetStateAction<ImageFile[]>>
    ) => {
        if (!files) return;

        const newImages: ImageFile[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const data = await fileToBase64(file);
            newImages.push({ name: file.name, data });
        }
        setImages(prev => [...prev, ...newImages]);
    };

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const removeImage = (index: number, setImages: React.Dispatch<React.SetStateAction<ImageFile[]>>) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleGenerateCalibration = async () => {
        if (darkImages.length === 0 || brightImages.length === 0) {
            setStatusMessage('Please upload both dark and bright images.');
            setStep('error');
            setTimeout(() => { setStep('idle'); setStatusMessage(''); }, 3000);
            return;
        }

        setStep('uploading');
        setStatusMessage('Uploading calibration images to server...');

        sendCommand('upload_calibration_images', {
            dark_images: darkImages.map(img => img.data),
            bright_images: brightImages.map(img => img.data),
            temperature: temperature,
            integration_time_ms: integrationTime
        });

        setTimeout(() => {
            setStep('generating');
            setStatusMessage('Generating NUC/BPR coefficients from images...');
            sendCommand('generate_calibration_coefficients', {
                temperature: temperature,
                integration_time_ms: integrationTime
            });
        }, 1000);

        setTimeout(() => {
            setStep('complete');
            setStatusMessage('Calibration coefficients generated successfully.');
        }, 3000);

        setTimeout(() => {
            setStep('idle');
            setStatusMessage('');
        }, 6000);
    };

    const handleWriteToFlash = () => {
        setStep('writing');
        setStatusMessage(`Writing calibration data to memory slot ${memorySlot}...`);

        sendCommand('write_calibration_to_flash', {
            memory_slot: memorySlot,
            temperature: temperature,
            integration_time_ms: integrationTime
        });

        setTimeout(() => {
            setStep('complete');
            setStatusMessage(`Calibration data written to slot ${memorySlot}.`);
        }, 2000);

        setTimeout(() => {
            setStep('idle');
            setStatusMessage('');
        }, 5000);
    };

    const handleRunDemoScript = () => {
        setStep('generating');
        setStatusMessage('Running calibration demo script...');
        sendCommand('run_calibration_script');

        setTimeout(() => {
            setStep('complete');
            setStatusMessage('Calibration script completed. Check logs.');
        }, 3000);

        setTimeout(() => {
            setStep('idle');
            setStatusMessage('');
        }, 6000);
    };

    const StatusIcon: FC = () => {
        switch(step) {
            case 'uploading':
            case 'generating':
            case 'writing':
                return <ArrowPathIcon className="w-5 h-5 text-cyan-400 animate-spin" />;
            case 'complete':
                return <CheckCircleIcon className="w-5 h-5 text-green-400" />;
            case 'error':
                return <ExclamationCircleIcon className="w-5 h-5 text-red-400" />;
            default:
                return null;
        }
    };

    const ImageList: FC<{ images: ImageFile[]; setImages: React.Dispatch<React.SetStateAction<ImageFile[]>> }> = ({ images, setImages }) => (
        <div className="space-y-1 max-h-24 overflow-y-auto">
            {images.map((img, idx) => (
                <div key={idx} className="flex items-center justify-between bg-gray-900/50 px-2 py-1 rounded text-xs">
                    <span className="truncate flex-1 text-gray-300">{img.name}</span>
                    <button
                        onClick={() => removeImage(idx, setImages)}
                        className="ml-2 text-red-400 hover:text-red-300"
                        disabled={isProcessing}
                    >
                        <TrashIcon className="w-4 h-4" />
                    </button>
                </div>
            ))}
        </div>
    );

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-400">Dark Images (lens capped)</label>
                    <input
                        ref={darkInputRef}
                        type="file"
                        accept="image/*,.raw,.bin"
                        multiple
                        onChange={(e) => handleFileSelect(e.target.files, setDarkImages)}
                        className="hidden"
                    />
                    <button
                        onClick={() => darkInputRef.current?.click()}
                        disabled={isProcessing}
                        className="w-full border-2 border-dashed border-gray-600 hover:border-cyan-500 rounded-lg p-3 text-sm text-gray-400 hover:text-cyan-400 transition-colors disabled:opacity-50"
                    >
                        <DocumentArrowUpIcon className="w-5 h-5 mx-auto mb-1" />
                        Click to select dark images
                    </button>
                    {darkImages.length > 0 && (
                        <div className="text-xs text-cyan-400 mb-1">{darkImages.length} file(s) selected</div>
                    )}
                    <ImageList images={darkImages} setImages={setDarkImages} />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-400">Bright Images (uniform illumination)</label>
                    <input
                        ref={brightInputRef}
                        type="file"
                        accept="image/*,.raw,.bin"
                        multiple
                        onChange={(e) => handleFileSelect(e.target.files, setBrightImages)}
                        className="hidden"
                    />
                    <button
                        onClick={() => brightInputRef.current?.click()}
                        disabled={isProcessing}
                        className="w-full border-2 border-dashed border-gray-600 hover:border-cyan-500 rounded-lg p-3 text-sm text-gray-400 hover:text-cyan-400 transition-colors disabled:opacity-50"
                    >
                        <DocumentArrowUpIcon className="w-5 h-5 mx-auto mb-1" />
                        Click to select bright images
                    </button>
                    {brightImages.length > 0 && (
                        <div className="text-xs text-cyan-400 mb-1">{brightImages.length} file(s) selected</div>
                    )}
                    <ImageList images={brightImages} setImages={setBrightImages} />
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-700">
                <NumericInput
                    label="Temperature (C)"
                    value={temperature}
                    onChange={setTemperature}
                    min={-40}
                    max={85}
                    step={0.5}
                />
                <NumericInput
                    label="Int. Time (ms)"
                    value={integrationTime}
                    onChange={setIntegrationTime}
                    min={0.01}
                    max={100}
                    step={0.01}
                />
                <NumericInput
                    label="Memory Slot"
                    value={memorySlot}
                    onChange={setMemorySlot}
                    min={0}
                    max={49}
                    step={1}
                />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                    onClick={handleGenerateCalibration}
                    disabled={isProcessing || !isConnected || (darkImages.length === 0 && brightImages.length === 0)}
                    className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg transition-colors shadow-md"
                >
                    Generate Coefficients
                </button>
                <button
                    onClick={handleWriteToFlash}
                    disabled={isProcessing || !isConnected}
                    className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg transition-colors shadow-md"
                >
                    Write to Flash (Slot {memorySlot})
                </button>
            </div>

            {statusMessage && (
                <div className="flex items-center justify-center space-x-3 p-3 bg-gray-900/50 rounded-md text-sm text-gray-300">
                    <StatusIcon />
                    <span>{statusMessage}</span>
                </div>
            )}

            <div className="pt-3 border-t border-gray-700">
                <p className="text-xs text-gray-500 mb-2">
                    Or run the pyqas demo script to write default calibration metadata:
                </p>
                <button
                    onClick={handleRunDemoScript}
                    disabled={isProcessing || !isConnected}
                    className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-gray-300 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                >
                    Run Default Calibration Script
                </button>
            </div>
        </div>
    );
};
