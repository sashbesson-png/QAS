
import React, { FC } from 'react';
import type { DacChannel, DacVoltages } from '../types';
import { NumericInput } from './NumericInput';
import { TextInput } from './TextInput';

interface AdvancedControlsProps {
  dacChannel: DacChannel;
  setDacChannel: (channel: DacChannel) => void;
  dacVoltages: DacVoltages;
  setDacVoltages: (voltages: DacVoltages) => void;
  registerAddress: string;
  setRegisterAddress: (address: string) => void;
  registerValue: string;
  setRegisterValue: (value: string) => void;
  fpgaRegisterAddress: string;
  setFpgaRegisterAddress: (address: string) => void;
  fpgaRegisterValue: string;
  setFpgaRegisterValue: (value: string) => void;
  flashAddress: string;
  setFlashAddress: (address: string) => void;
  sendCommand: (command: string, params?: Record<string, any>) => void;
  isConnected: boolean;
}

const DAC_CHANNEL_OPTIONS: { label: string; value: DacChannel }[] = [
  { label: 'VRST', value: 0 },
  { label: 'VDETCOM', value: 1 },
  { label: 'VPDI', value: 2 },
];

export const AdvancedControls: FC<AdvancedControlsProps> = ({
  dacChannel,
  setDacChannel,
  dacVoltages,
  setDacVoltages,
  registerAddress,
  setRegisterAddress,
  registerValue,
  setRegisterValue,
  fpgaRegisterAddress,
  setFpgaRegisterAddress,
  fpgaRegisterValue,
  setFpgaRegisterValue,
  flashAddress,
  setFlashAddress,
  sendCommand,
  isConnected,
}) => {

  const handleDacVoltageChange = (newVoltage: number) => {
    setDacVoltages({
      ...dacVoltages,
      [dacChannel]: newVoltage,
    });
  };

  const handleSetDac = () => {
    sendCommand('set_dac_voltage', { channel: dacChannel, voltage: dacVoltages[dacChannel] });
  };
  
  const handleReadDeviceRegister = () => {
    sendCommand('read_device', { address: parseInt(registerAddress, 16) });
  };

  const handleWriteDeviceRegister = () => {
    sendCommand('write_device', { address: parseInt(registerAddress, 16), data: parseInt(registerValue, 16) });
  };
  
  const handleReadFpgaRegister = () => {
    sendCommand('read_fpga_register', { address: parseInt(fpgaRegisterAddress, 16) });
  };

  const handleWriteFpgaRegister = () => {
    sendCommand('write_fpga_registers', { addresses: [parseInt(fpgaRegisterAddress, 16)], values: [parseInt(fpgaRegisterValue, 16)] });
  };
  
  const handleReadFlash = () => {
    // As per docs, read_flash takes start_address and number_of_words.
    // 256 bytes = 64 words (uint32).
    sendCommand('read_flash', { 
        start_address: parseInt(flashAddress, 16),
        number_of_words: 64
    });
  };

  return (
    <div className="space-y-6">
      {/* DAC Control */}
      <div className="p-4 border border-gray-700 rounded-lg">
        <h3 className="font-semibold text-lg text-cyan-300 mb-3">DAC Control</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-400">Channel</label>
            <select
              value={dacChannel}
              onChange={(e) => setDacChannel(Number(e.target.value) as DacChannel)}
              className="mt-1 block w-full text-sm bg-gray-700 border-gray-600 rounded-md p-2 focus:ring-cyan-500 focus:border-cyan-500 text-white"
            >
              {DAC_CHANNEL_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <NumericInput label="Voltage" value={dacVoltages[dacChannel]} onChange={handleDacVoltageChange} min={0} max={2.5} step={0.01} />
          <button onClick={handleSetDac} disabled={!isConnected} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-md">
            Set Voltage
          </button>
        </div>
      </div>

      {/* Device Register Access */}
      <div className="p-4 border border-gray-700 rounded-lg">
        <h3 className="font-semibold text-lg text-cyan-300 mb-3">Device Register Access</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-2">
            <TextInput label="Address (hex)" value={registerAddress} onChange={setRegisterAddress} placeholder="e.g., 0x08" monospace />
          </div>
          <TextInput label="Value (hex)" value={registerValue} onChange={setRegisterValue} placeholder="e.g., 0x55" monospace />
          <div className="flex space-x-2">
            <button onClick={handleReadDeviceRegister} disabled={!isConnected} className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-md">Read</button>
            <button onClick={handleWriteDeviceRegister} disabled={!isConnected} className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-md">Write</button>
          </div>
        </div>
      </div>
      
       {/* FPGA Register Access */}
       <div className="p-4 border border-gray-700 rounded-lg">
        <h3 className="font-semibold text-lg text-cyan-300 mb-3">FPGA Register Access</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-2">
            <TextInput label="Address (hex)" value={fpgaRegisterAddress} onChange={setFpgaRegisterAddress} placeholder="e.g., 0x01" monospace />
          </div>
          <TextInput label="Value (hex)" value={fpgaRegisterValue} onChange={setFpgaRegisterValue} placeholder="e.g., 0x100" monospace />
          <div className="flex space-x-2">
            <button onClick={handleReadFpgaRegister} disabled={!isConnected} className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-md">Read</button>
            <button onClick={handleWriteFpgaRegister} disabled={!isConnected} className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-md">Write</button>
          </div>
        </div>
      </div>
      
      {/* Flash Memory */}
      <div className="p-4 border border-gray-700 rounded-lg">
        <h3 className="font-semibold text-lg text-cyan-300 mb-3">Flash Memory</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <TextInput label="Start Address (hex)" value={flashAddress} onChange={setFlashAddress} placeholder="e.g., 0x20000" monospace />
            </div>
            <button onClick={handleReadFlash} disabled={!isConnected} className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-md">
              Read 256 Bytes
            </button>
        </div>
      </div>
    </div>
  );
};
