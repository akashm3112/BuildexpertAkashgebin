import { Platform } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '@/constants/api';

// Conditionally import WebRTC only on native platforms
let RTCPeerConnection: any;
let RTCSessionDescription: any;
let RTCIceCandidate: any;
let mediaDevices: any;

if (Platform.OS !== 'web') {
  try {
    const webrtc = require('react-native-webrtc');
    RTCPeerConnection = webrtc.RTCPeerConnection;
    RTCSessionDescription = webrtc.RTCSessionDescription;
    RTCIceCandidate = webrtc.RTCIceCandidate;
    mediaDevices = webrtc.mediaDevices;
  } catch (error) {
    console.warn('WebRTC not available:', error);
  }
}

// WebRTC Configuration with free STUN servers
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export interface CallData {
  bookingId: string;
  callerId: string;
  callerName: string;
  receiverId: string;
  receiverName: string;
  serviceName?: string;
}

export interface CallEvents {
  onIncomingCall: (data: CallData) => void;
  onCallAccepted: () => void;
  onCallRejected: (reason: string) => void;
  onCallEnded: (duration: number, endedBy: string) => void;
  onCallConnected: () => void;
  onError: (error: string) => void;
}

class WebRTCService {
  private socket: Socket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: any = null;
  private userId: string | null = null;
  private currentCall: CallData | null = null;
  private callStartTime: number | null = null;
  private events: Partial<CallEvents> = {};
  private isWebRTCAvailable: boolean = false;

  constructor() {
    this.isWebRTCAvailable = Platform.OS !== 'web' && !!RTCPeerConnection;
    if (this.isWebRTCAvailable) {
    } else {
      console.warn('⚠️ WebRTC not available on this platform (web browser). Calling features disabled.');
    }
  }

  // Check if WebRTC is available and show appropriate message
  private checkWebRTCAvailability(): boolean {
    if (!this.isWebRTCAvailable) {
      this.events.onError?.('Calling is not available on web browsers. Please use the mobile app for voice calls.');
      return false;
    }
    return true;
  }

  // Initialize Socket.io connection
  async initialize(userId: string, token: string) {
    if (this.socket?.connected) {
      return;
    }

    this.userId = userId;

    this.socket = io(API_BASE_URL, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      this.socket?.emit('join', userId);
    });

    this.socket.on('disconnect', () => {
      this.cleanup();
    });

    this.setupSocketListeners();
  }

  // Set up Socket.io event listeners
  private setupSocketListeners() {
    if (!this.socket) return;

    // Incoming call
    this.socket.on('call:incoming', (data: CallData) => {
      this.currentCall = data;
      this.events.onIncomingCall?.(data);
    });

    // Call accepted
    this.socket.on('call:accepted', async ({ receiverId, socketId }) => {
      this.events.onCallAccepted?.();
      await this.createOffer();
    });

    // Call rejected
    this.socket.on('call:rejected', ({ reason }) => {
      this.events.onCallRejected?.(reason);
      this.cleanup();
    });

    // WebRTC Offer received
    this.socket.on('call:offer', async ({ offer, from }) => {
      await this.handleOffer(offer, from);
    });

    // WebRTC Answer received
    this.socket.on('call:answer', async ({ answer }) => {
      await this.handleAnswer(answer);
    });

    // ICE Candidate received
    this.socket.on('call:ice-candidate', async ({ candidate }) => {
      if (candidate && this.peerConnection) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('❌ Error adding ICE candidate:', error);
        }
      }
    });

    // Call ended
    this.socket.on('call:ended', ({ duration, endedBy }) => {
      console.log('📞 Call ended by:', endedBy, 'Duration:', duration);
      this.events.onCallEnded?.(duration || 0, endedBy);
      this.cleanup();
    });
  }

  // Register event handlers
  on(events: Partial<CallEvents>) {
    this.events = { ...this.events, ...events };
  }

  // Start a call
  async startCall(callData: CallData) {
    let serverCallInitiated = false;
    try {
      if (!this.checkWebRTCAvailability()) {
        return;
      }

      this.currentCall = callData;

      await this.ensureServerCallSetup(callData);
      serverCallInitiated = true;

      // Get local audio stream with error handling
      try {
        this.localStream = await mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } catch (mediaError: any) {
        console.error('❌ Failed to get audio stream:', mediaError);
        if (mediaError.name === 'NotAllowedError') {
          throw new Error('Microphone access denied. Please allow microphone access to make calls.');
        } else if (mediaError.name === 'NotFoundError') {
          throw new Error('No microphone found. Please connect a microphone to make calls.');
        } else {
          throw new Error('Failed to access microphone. Please check your audio settings.');
        }
      }

      // Create peer connection
      this.peerConnection = new RTCPeerConnection(RTC_CONFIG);

      // Add local stream
      this.localStream.getTracks().forEach((track: any) => {
        this.peerConnection?.addTrack(track, this.localStream);
      });

      // Handle ICE candidates
      this.peerConnection!.onicecandidate = (event) => {
        if (event.candidate && this.peerConnection) {
          this.socket?.emit('call:ice-candidate', {
            bookingId: callData.bookingId,
            candidate: event.candidate,
            to: callData.receiverId,
          });
        }
      };

      // Handle connection state changes
      this.peerConnection!.onconnectionstatechange = () => {
        if (this.peerConnection) {
          switch (this.peerConnection.connectionState) {
            case 'connected':
              this.callStartTime = Date.now();
              this.events.onCallConnected?.();
              this.startCallQualityMonitoring();
              break;
            case 'disconnected':
              console.warn('📞 Connection lost, attempting to reconnect...');
              // Attempt to reconnect by creating a new offer
              setTimeout(() => {
                if (this.peerConnection?.connectionState === 'disconnected') {
                  this.createOffer();
                }
              }, 2000);
              break;
            case 'failed':
              console.error('📞 Connection failed');
              this.events.onError?.('Call connection failed. Please try again.');
              this.cleanup();
              break;
            case 'closed':
              this.cleanup();
              break;
          }
        }
      };

      // Handle ICE connection state changes
      this.peerConnection!.oniceconnectionstatechange = () => {
        if (this.peerConnection) {
          if (this.peerConnection.iceConnectionState === 'failed') {
            console.error('📞 ICE connection failed');
            this.events.onError?.('Network connection failed. Please check your internet connection.');
            this.cleanup();
          }
        }
      };

    } catch (error: any) {
      console.error('❌ Error starting call:', error);
      this.events.onError?.(error.message || 'Failed to start call');
      if (serverCallInitiated) {
        this.socket?.emit('call:end', {
          bookingId: callData.bookingId,
          userId: this.userId,
        });
      }
      this.cleanup();
    }
  }

  // Accept incoming call
  async acceptCall() {
    try {
      if (!this.isWebRTCAvailable) {
        throw new Error('WebRTC is not available on web browser. Please use the mobile app for calling.');
      }

      if (!this.currentCall) {
        throw new Error('No incoming call to accept');
      }


      // Get local audio stream
      this.localStream = await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      // Create peer connection
      this.peerConnection = new RTCPeerConnection(RTC_CONFIG);

      // Add local stream
      this.localStream.getTracks().forEach((track: any) => {
        this.peerConnection?.addTrack(track, this.localStream);
      });

      // Handle ICE candidates
      this.peerConnection!.onicecandidate = (event) => {
        if (event.candidate && this.peerConnection) {
          this.socket?.emit('call:ice-candidate', {
            bookingId: this.currentCall?.bookingId,
            candidate: event.candidate,
            to: this.currentCall?.callerId,
          });
        }
      };

      // Handle connection state changes
      this.peerConnection!.onconnectionstatechange = () => {
        if (this.peerConnection) {
          if (this.peerConnection.connectionState === 'connected') {
            this.callStartTime = Date.now();
            this.events.onCallConnected?.();
          }
        }
      };

      // Notify caller that call is accepted
      this.socket?.emit('call:accept', {
        bookingId: this.currentCall.bookingId,
        receiverId: this.userId,
      });

    } catch (error) {
      console.error('❌ Error accepting call:', error);
      this.events.onError?.('Failed to accept call');
      this.cleanup();
    }
  }

  // Reject incoming call
  rejectCall(reason = 'declined') {
    if (!this.currentCall) return;

    this.socket?.emit('call:reject', {
      bookingId: this.currentCall.bookingId,
      reason,
    });

    this.cleanup();
  }

  // Create WebRTC offer
  private async createOffer() {
    try {
      if (!this.peerConnection) return;

      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });

      await this.peerConnection.setLocalDescription(offer);

      this.socket?.emit('call:offer', {
        bookingId: this.currentCall?.bookingId,
        offer: this.peerConnection.localDescription,
        to: this.currentCall?.receiverId,
      });
    } catch (error) {
      console.error('❌ Error creating offer:', error);
      this.events.onError?.('Failed to create offer');
    }
  }

  // Handle WebRTC offer
  private async handleOffer(offer: any, from: string) {
    try {
      if (!this.peerConnection) return;

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.socket?.emit('call:answer', {
        bookingId: this.currentCall?.bookingId,
        answer: this.peerConnection.localDescription,
        to: from,
      });
    } catch (error) {
      console.error('❌ Error handling offer:', error);
      this.events.onError?.('Failed to handle offer');
    }
  }

  // Handle WebRTC answer
  private async handleAnswer(answer: any) {
    try {
      if (!this.peerConnection) return;

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('❌ Error handling answer:', error);
      this.events.onError?.('Failed to handle answer');
    }
  }

  // End call
  async endCall() {
    if (!this.currentCall) return;

    const duration = this.callStartTime ? Math.floor((Date.now() - this.callStartTime) / 1000) : 0;


    this.socket?.emit('call:end', {
      bookingId: this.currentCall.bookingId,
      userId: this.userId,
    });

    this.cleanup();
  }

  // Cleanup resources
  // Monitor call quality
  private startCallQualityMonitoring() {
    if (!this.peerConnection || !this.currentCall) return;
    
    const monitorInterval = setInterval(() => {
      if (!this.peerConnection || !this.currentCall) {
        clearInterval(monitorInterval);
        return;
      }
      
      // Check connection state
      if (this.peerConnection.connectionState === 'failed') {
        console.warn('📞 Call quality: Connection failed');
        this.events.onError?.('Call connection lost. Attempting to reconnect...');
        clearInterval(monitorInterval);
        return;
      }
      
      // Check ICE connection state
      if (this.peerConnection.iceConnectionState === 'failed') {
        console.warn('📞 Call quality: ICE connection failed');
        this.events.onError?.('Network connection lost. Please check your internet connection.');
        clearInterval(monitorInterval);
        return;
      }
      
      // Log connection quality
      console.log('📞 Call quality:', {
        connectionState: this.peerConnection.connectionState,
        iceConnectionState: this.peerConnection.iceConnectionState,
        iceGatheringState: this.peerConnection.iceGatheringState,
        signalingState: this.peerConnection.signalingState
      });
      
    }, 10000); // Check every 10 seconds
  }

  private cleanup() {

    if (this.localStream) {
      this.localStream.getTracks().forEach((track: any) => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.currentCall = null;
    this.callStartTime = null;
  }

  // Disconnect socket
  disconnect() {
    this.cleanup();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Get current call data
  getCurrentCall() {
    return this.currentCall;
  }

  // Check if call is active
  isCallActive() {
    return this.peerConnection !== null && this.currentCall !== null;
  }

  private ensureServerCallSetup(callData: CallData) {
    return new Promise<void>((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected to call service.'));
        return;
      }

      this.socket.emit('call:initiate', { bookingId: callData.bookingId }, (response?: { status: string; message?: string; errorCode?: string }) => {
        if (!response || response.status === 'success') {
          resolve();
        } else {
          const err = new Error(response.message || 'Failed to start call');
          (err as any).code = response.errorCode;
          reject(err);
        }
      });
    });
  }
}

// Export singleton instance
export const webRTCService = new WebRTCService();

