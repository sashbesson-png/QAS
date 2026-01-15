
import React, { FC, memo } from 'react';
import { Section } from './Section';
import { BeakerIcon } from './icons';

interface DiagnosticsProps {
    totalMessages: number;
    framesReceived: number;
    statusUpdates: number;
    lastRawMessage: string;
}

const DiagnosticsComponent: FC<DiagnosticsProps> = ({ totalMessages, framesReceived, statusUpdates, lastRawMessage }) => {

    const Stat: FC<{ label: string; value: number | string }> = ({ label, value }) => (
        <div className="flex justify-between items-center text-sm">
            <span className="text-gray-400">{label}:</span>
            <span className="font-mono font-bold text-cyan-300">{value}</span>
        </div>
    );
    
    // Truncate message for display
    const truncatedMessage = lastRawMessage.length > 100 ? `${lastRawMessage.substring(0, 100)}...` : lastRawMessage;

    return (
        <Section title="Diagnostics" icon={<BeakerIcon className="w-6 h-6" />} defaultOpen={false}>
            <div className="space-y-3">
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <div className="text-xs text-gray-400">Total Msgs</div>
                        <div className="text-lg font-bold text-white">{totalMessages}</div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-400">Frames Rcvd</div>
                        <div className="text-lg font-bold text-white">{framesReceived}</div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-400">Status Updates</div>
                        <div className="text-lg font-bold text-white">{statusUpdates}</div>
                    </div>
                </div>
                <div className="border-t border-gray-700 pt-3 mt-3">
                     <p className="text-xs text-gray-400 font-medium mb-1">Last Raw Message:</p>
                     <div className="p-2 bg-black/30 rounded-md font-mono text-xs text-gray-300 break-all h-16 overflow-y-auto">
                        {lastRawMessage || 'No messages received yet.'}
                     </div>
                </div>
            </div>
        </Section>
    );
};

export const Diagnostics = memo(DiagnosticsComponent);
