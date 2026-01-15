
export type CameraStatus = 'POWERED_OFF' | 'IDLE' | 'STREAMING';

export type DacChannel = 0 | 1 | 2; // 0=VRST, 1=VDETCOM, 2=VPDI

export type DacVoltages = {
  [key in DacChannel]: number;
};

export type WsConnectionStatus = 'DISCONNECTED' | 'CONNECTED' | 'CONNECTING';

export type ImageSourceType = 'live' | 'simulated' | 'none';
