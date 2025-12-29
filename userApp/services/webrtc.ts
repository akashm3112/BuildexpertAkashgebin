import { Platform } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '@/constants/api';
import { webrtcErrorHandler, WebRTCErrorType, RecoveryAction, ErrorContext } from '@/utils/webrtcErrorHandler';

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
    // WebRTC not available
  }
}

// WebRTC Configuration with free STUN servers and TURN fallback
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
};

// TURN server configuration (fallback for NAT traversal issues)
const RTC_CONFIG_WITH_TURN = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // Note: Add TURN servers here if available
    // { urls: 'turn:your-turn-server.com:3478', username: 'user', credential: 'pass' },
  ],
  iceCandidatePoolSize: 10,
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
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private iceRestartTimeout: ReturnType<typeof setTimeout> | null = null;
  private qualityMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private useTurnServer: boolean = false;
  private connectionRetryCount: number = 0;
  private readonly MAX_CONNECTION_RETRIES = 3;
  private pendingIceCandidates: any[] = [];

  constructor() {
    this.isWebRTCAvailable = Platform.OS !== 'web' && !!RTCPeerConnection;
    if (this.isWebRTCAvailable) {
    } else {
      // WebRTC not available on this platform (web browser). Calling features disabled.
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
    if (this.socket?.connected && this.userId === userId) {
      return;
    }

    this.userId = userId;

    // Disconnect existing socket if any
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(API_BASE_URL, {
      // CRITICAL: Use polling as fallback for mobile data networks
      // Mobile carriers often block WebSocket connections, so polling is more reliable
      transports: ['polling', 'websocket'], // Try polling first, upgrade to websocket if available
      upgrade: true, // Allow upgrade from polling to websocket
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      forceNew: false, // Reuse existing connection if available
    });

    // Wait for connection before proceeding
    return new Promise<void>((resolve, reject) => {
      const connectionTimeout = setTimeout(() => {
        if (!this.socket?.connected) {
          this.socket?.disconnect();
          reject(new Error('Socket connection timed out. Please check your internet connection.'));
        }
      }, 20000); // 20 seconds timeout for connection (increased for slower networks)

      this.socket!.on('connect', () => {
        clearTimeout(connectionTimeout);
        // Join user room immediately after connection
        // Wait a small delay to ensure socket is fully ready
        setTimeout(() => {
          this.socket?.emit('join', userId);
          this.setupSocketListeners();
          // Give socket time to process join before resolving
          setTimeout(() => resolve(), 100);
        }, 100);
      });

      this.socket!.on('connect_error', (error) => {
        clearTimeout(connectionTimeout);
        reject(new Error(`Socket connection failed: ${error.message || 'Unknown error'}`));
      });

      this.socket!.on('disconnect', () => {
        this.handleSocketDisconnect();
      });

      this.socket!.on('error', (error) => {
        this.handleSocketError(error);
      });

      this.socket!.on('reconnect', () => {
        if (this.userId) {
          this.socket?.emit('join', this.userId);
        }
      });

      this.socket!.on('reconnect_error', (error) => {
        // Socket reconnection error
      });
    });
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
          // Only add ICE candidate if remote description is set
          if (this.peerConnection.remoteDescription) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            // Store candidate to add later when remote description is set
            if (!this.pendingIceCandidates) {
              this.pendingIceCandidates = [];
            }
            this.pendingIceCandidates.push(candidate);
          }
        } catch (error) {
          console.error('Error adding ICE candidate:', error);
        }
      }
    });

    // Call ended
    this.socket.on('call:ended', ({ duration, endedBy }) => {
      this.events.onCallEnded?.(duration || 0, endedBy);
      this.cleanup();
    });

    // Call error from server
    this.socket.on('call:error', ({ bookingId, message, errorCode }) => {
      const error = new Error(message || 'Call error occurred');
      (error as any).code = errorCode;
      this.handleError(error, 'server_error');
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

      // Handle connection state changes with comprehensive recovery
      this.peerConnection!.onconnectionstatechange = () => {
        if (!this.peerConnection) return;
        
        const state = this.peerConnection.connectionState;
        
        switch (state) {
          case 'connected':
            this.callStartTime = Date.now();
            this.connectionRetryCount = 0;
            webrtcErrorHandler.resetRetryCount('connection');
            this.events.onCallConnected?.();
            this.startCallQualityMonitoring();
            break;
            
          case 'disconnected':
            this.handleDisconnection();
            break;
            
          case 'failed':
            this.handleConnectionFailure();
            break;
            
          case 'connecting':
            // Connection attempt in progress
            break;
            
          case 'closed':
            this.cleanup();
            break;
        }
      };

      // Handle ICE connection state changes with recovery
      this.peerConnection!.oniceconnectionstatechange = () => {
        if (!this.peerConnection) return;
        
        const iceState = this.peerConnection.iceConnectionState;
        
        switch (iceState) {
          case 'failed':
            this.handleICEFailure();
            break;
            
          case 'disconnected':
            // ICE disconnected but may recover
            break;
            
          case 'connected':
          case 'completed':
            // ICE connection successful
            webrtcErrorHandler.resetRetryCount('ice');
            break;
        }
      };

      // Handle ICE gathering state
      this.peerConnection!.onicegatheringstatechange = () => {
        // ICE gathering state changed
      };

    } catch (error: any) {
      this.handleError(error, 'start_call', { serverCallInitiated });
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
        if (mediaError.name === 'NotAllowedError') {
          throw new Error('Microphone access denied. Please allow microphone access to accept calls.');
        } else if (mediaError.name === 'NotFoundError') {
          throw new Error('No microphone found. Please connect a microphone to accept calls.');
        } else {
          throw new Error('Failed to access microphone. Please check your audio settings.');
        }
      }

      // Create peer connection
      const config = this.useTurnServer ? RTC_CONFIG_WITH_TURN : RTC_CONFIG;
      this.peerConnection = new RTCPeerConnection(config);

      // Add local stream
      this.localStream.getTracks().forEach((track: any) => {
        this.peerConnection?.addTrack(track, this.localStream);
      });

      // Setup peer connection handlers
      this.setupPeerConnectionHandlers();

      // Notify caller that call is accepted
      this.socket?.emit('call:accept', {
        bookingId: this.currentCall.bookingId,
        receiverId: this.userId,
      });

    } catch (error) {
      this.handleError(error, 'accept_call');
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
      if (!this.peerConnection) {
        console.error('Cannot create offer: peer connection not initialized');
        return;
      }

      // Wait for ICE gathering to complete or timeout after 5 seconds
      if (this.peerConnection.iceGatheringState !== 'complete') {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            resolve(); // Continue even if gathering doesn't complete
          }, 5000);

          const checkState = () => {
            if (this.peerConnection?.iceGatheringState === 'complete') {
              clearTimeout(timeout);
              resolve();
            }
          };

          this.peerConnection!.onicegatheringstatechange = checkState;
        });
      }

      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });

      await this.peerConnection.setLocalDescription(offer);

      // Wait a bit for local description to be set
      await new Promise(resolve => setTimeout(resolve, 100));

      this.socket?.emit('call:offer', {
        bookingId: this.currentCall?.bookingId,
        offer: this.peerConnection.localDescription,
        to: this.currentCall?.receiverId,
      });
    } catch (error) {
      console.error('Error creating offer:', error);
      this.handleError(error, 'create_offer');
    }
  }

  // Handle WebRTC offer
  private async handleOffer(offer: any, from: string) {
    try {
      if (!this.peerConnection) return;

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      // Add any pending ICE candidates now that remote description is set
      if (this.pendingIceCandidates && this.pendingIceCandidates.length > 0) {
        for (const candidate of this.pendingIceCandidates) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (error) {
            console.error('Error adding pending ICE candidate:', error);
          }
        }
        this.pendingIceCandidates = [];
      }

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.socket?.emit('call:answer', {
        bookingId: this.currentCall?.bookingId,
        answer: this.peerConnection.localDescription,
        to: from,
      });
    } catch (error) {
      this.handleError(error, 'handle_offer');
    }
  }

  // Handle WebRTC answer
  private async handleAnswer(answer: any) {
    try {
      if (!this.peerConnection) return;

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

      // Add any pending ICE candidates now that remote description is set
      if (this.pendingIceCandidates && this.pendingIceCandidates.length > 0) {
        for (const candidate of this.pendingIceCandidates) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (error) {
            console.error('Error adding pending ICE candidate:', error);
          }
        }
        this.pendingIceCandidates = [];
      }
    } catch (error) {
      this.handleError(error, 'handle_answer');
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
  // Monitor call quality with enhanced metrics
  private startCallQualityMonitoring() {
    if (!this.peerConnection || !this.currentCall) return;
    
    this.qualityMonitorInterval = setInterval(async () => {
      if (!this.peerConnection || !this.currentCall) {
        if (this.qualityMonitorInterval) {
          clearInterval(this.qualityMonitorInterval);
          this.qualityMonitorInterval = null;
        }
        return;
      }
      
      // Check connection state
      if (this.peerConnection.connectionState === 'failed') {
        this.handleConnectionFailure();
        if (this.qualityMonitorInterval) {
          clearInterval(this.qualityMonitorInterval);
          this.qualityMonitorInterval = null;
        }
        return;
      }
      
      // Check ICE connection state
      if (this.peerConnection.iceConnectionState === 'failed') {
        this.handleICEFailure();
        if (this.qualityMonitorInterval) {
          clearInterval(this.qualityMonitorInterval);
          this.qualityMonitorInterval = null;
        }
        return;
      }
      
      // Get connection statistics
      try {
        const stats = await this.peerConnection.getStats();
        const qualityMetrics = this.analyzeConnectionQuality(stats);
        
        // If quality is poor, attempt recovery
        if (qualityMetrics.isPoor) {
          if (this.peerConnection.iceConnectionState === 'connected' || 
              this.peerConnection.iceConnectionState === 'completed') {
            // Try ICE restart to improve connection
            this.restartICE();
          }
        }
      } catch (error) {
        // Error getting connection stats
      }
      
    }, 10000); // Check every 10 seconds
  }

  /**
   * Analyze connection quality from stats
   */
  private analyzeConnectionQuality(stats: any): {
    isPoor: boolean;
    packetLoss?: number;
    jitter?: number;
    rtt?: number;
  } {
    // Basic quality analysis
    // In production, you would parse RTCStatsReport for detailed metrics
    return {
      isPoor: false, // Placeholder - implement detailed analysis
    };
  }

  /**
   * Handle errors with recovery strategies
   */
  private handleError(error: Error | any, context: string, options?: { serverCallInitiated?: boolean }) {
    const errorContext: ErrorContext = {
      error,
      context,
      peerConnectionState: this.peerConnection?.connectionState,
      iceConnectionState: this.peerConnection?.iceConnectionState,
      signalingState: this.peerConnection?.signalingState,
      retryCount: webrtcErrorHandler.getRetryCount(context)
    };

    const errorType = webrtcErrorHandler.categorizeError(error, errorContext);
    const recoveryAction = webrtcErrorHandler.getRecoveryAction(errorType, errorContext);

    // Execute recovery action
    this.executeRecoveryAction(recoveryAction, context, errorContext, options);
  }

  /**
   * Execute recovery action
   */
  private async executeRecoveryAction(
    recoveryAction: RecoveryAction,
    context: string,
    errorContext: ErrorContext,
    options?: { serverCallInitiated?: boolean }
  ) {
    switch (recoveryAction.action) {
      case 'RETRY':
        if (recoveryAction.backoffMs && recoveryAction.retryCount !== undefined) {
          webrtcErrorHandler.incrementRetryCount(context);
          
          setTimeout(() => {
            if (context === 'start_call' && this.currentCall) {
              this.startCall(this.currentCall).catch(err => {
                if (recoveryAction.fallback) {
                  this.executeRecoveryAction(recoveryAction.fallback, context, errorContext, options);
                } else {
                  this.showError(webrtcErrorHandler.getUserFriendlyMessage(
                    webrtcErrorHandler.categorizeError(err, errorContext),
                    err
                  ));
                  this.cleanup();
                }
              });
            } else if (context === 'create_offer') {
              this.createOffer();
            }
          }, recoveryAction.backoffMs);
        }
        break;

      case 'ICE_RESTART':
        if (recoveryAction.backoffMs && recoveryAction.retryCount !== undefined) {
          webrtcErrorHandler.incrementRetryCount('ice');
          
          this.iceRestartTimeout = setTimeout(() => {
            this.restartICE();
          }, recoveryAction.backoffMs);
        }
        break;

      case 'RECONNECT':
        if (recoveryAction.backoffMs && recoveryAction.retryCount !== undefined) {
          webrtcErrorHandler.incrementRetryCount('connection');
          
          this.reconnectTimeout = setTimeout(() => {
            this.reconnectCall();
          }, recoveryAction.backoffMs);
        }
        break;

      case 'FALLBACK_TURN':
        this.useTurnServer = true;
        if (this.currentCall) {
          // Recreate peer connection with TURN
          this.cleanup();
          setTimeout(() => {
            if (this.currentCall) {
              this.startCall(this.currentCall).catch(err => {
                if (recoveryAction.fallback) {
                  this.executeRecoveryAction(recoveryAction.fallback, context, errorContext, options);
                } else {
                  this.showError(webrtcErrorHandler.getUserFriendlyMessage(
                    webrtcErrorHandler.categorizeError(err, errorContext),
                    err
                  ));
                  this.cleanup();
                }
              });
            }
          }, recoveryAction.backoffMs || 1000);
        }
        break;

      case 'SHOW_ERROR':
        const errorType = webrtcErrorHandler.categorizeError(errorContext.error, errorContext);
        const message = webrtcErrorHandler.getUserFriendlyMessage(errorType, errorContext.error);
        this.showError(message);
        if (recoveryAction.fallback) {
          this.executeRecoveryAction(recoveryAction.fallback, context, errorContext, options);
        } else {
          this.cleanup();
        }
        break;

      case 'CLEANUP':
        if (options?.serverCallInitiated && this.currentCall) {
          this.socket?.emit('call:end', {
            bookingId: this.currentCall.bookingId,
            userId: this.userId,
          });
        }
        this.cleanup();
        break;
    }
  }

  /**
   * Handle disconnection with recovery
   */
  private handleDisconnection() {
    if (this.connectionRetryCount < this.MAX_CONNECTION_RETRIES) {
      this.connectionRetryCount++;
      const backoff = Math.min(1000 * Math.pow(2, this.connectionRetryCount - 1), 5000);
      
      this.reconnectTimeout = setTimeout(() => {
        if (this.peerConnection?.connectionState === 'disconnected' && this.currentCall) {
          this.createOffer();
        }
      }, backoff);
    } else {
      this.events.onError?.('Connection lost. Please try calling again.');
      this.cleanup();
    }
  }

  /**
   * Handle connection failure with recovery
   */
  private handleConnectionFailure() {
    const error = new Error('Connection failed');
    (error as any).code = 'CONNECTION_FAILED';
    this.handleError(error, 'connection_failure');
  }

  /**
   * Handle ICE failure with recovery
   */
  private handleICEFailure() {
    const error = new Error('ICE connection failed');
    (error as any).code = 'ICE_FAILED';
    this.handleError(error, 'ice_failure');
  }

  /**
   * Restart ICE connection
   */
  private async restartICE() {
    if (!this.peerConnection || !this.currentCall) return;

    try {
      // Create new offer with iceRestart flag
      const offer = await this.peerConnection.createOffer({ iceRestart: true });
      await this.peerConnection.setLocalDescription(offer);

      this.socket?.emit('call:offer', {
        bookingId: this.currentCall.bookingId,
        offer: this.peerConnection.localDescription,
        to: this.currentCall.receiverId,
      });
    } catch (error) {
      this.handleError(error, 'ice_restart');
    }
  }

  /**
   * Reconnect call
   */
  private async reconnectCall() {
    if (!this.currentCall) return;

    try {
      // Cleanup existing connection
      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }

      // Recreate connection
      const config = this.useTurnServer ? RTC_CONFIG_WITH_TURN : RTC_CONFIG;
      this.peerConnection = new RTCPeerConnection(config);

      // Re-add local stream if available
      if (this.localStream) {
        this.localStream.getTracks().forEach((track: any) => {
          this.peerConnection?.addTrack(track, this.localStream);
        });
      }

      // Re-setup event handlers
      this.setupPeerConnectionHandlers();

      // Create new offer
      await this.createOffer();
    } catch (error) {
      this.handleError(error, 'reconnect');
    }
  }

  /**
   * Setup peer connection event handlers
   */
  private setupPeerConnectionHandlers() {
    if (!this.peerConnection || !this.currentCall) return;

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.peerConnection) {
        this.socket?.emit('call:ice-candidate', {
          bookingId: this.currentCall?.bookingId,
          candidate: event.candidate,
          to: this.currentCall?.receiverId,
        });
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      if (!this.peerConnection) return;
      
      const state = this.peerConnection.connectionState;
      
      switch (state) {
        case 'connected':
          this.callStartTime = Date.now();
          this.connectionRetryCount = 0;
          webrtcErrorHandler.resetRetryCount('connection');
          this.events.onCallConnected?.();
          this.startCallQualityMonitoring();
          break;
          
        case 'disconnected':
          this.handleDisconnection();
          break;
          
        case 'failed':
          this.handleConnectionFailure();
          break;
          
        case 'closed':
          this.cleanup();
          break;
      }
    };

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      if (!this.peerConnection) return;
      
      const iceState = this.peerConnection.iceConnectionState;
      
      switch (iceState) {
        case 'failed':
          this.handleICEFailure();
          break;
          
        case 'connected':
        case 'completed':
          webrtcErrorHandler.resetRetryCount('ice');
          break;
      }
    };
  }

  /**
   * Handle socket disconnect
   */
  private handleSocketDisconnect() {
    // If call is active, attempt to reconnect socket
    if (this.currentCall && this.userId) {
      // Socket.io will auto-reconnect, but we can handle it explicitly
      setTimeout(() => {
        if (!this.socket?.connected && this.userId) {
          // Socket will auto-reconnect, just wait
        }
      }, 2000);
    } else {
      this.cleanup();
    }
  }

  /**
   * Handle socket error
   */
  private handleSocketError(error: any) {
    const socketError = new Error('Socket connection error');
    (socketError as any).code = 'SOCKET_ERROR';
    this.handleError(socketError, 'socket_error');
  }

  /**
   * Show error to user
   */
  private showError(message: string) {
    this.events.onError?.(message);
  }

  private cleanup() {
    // Clear timeouts
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.iceRestartTimeout) {
      clearTimeout(this.iceRestartTimeout);
      this.iceRestartTimeout = null;
    }
    
    if (this.qualityMonitorInterval) {
      clearInterval(this.qualityMonitorInterval);
      this.qualityMonitorInterval = null;
    }

    // Stop all media tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track: any) => {
        track.stop();
        track.enabled = false;
      });
      this.localStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Reset state
    this.currentCall = null;
    this.callStartTime = null;
    this.connectionRetryCount = 0;
    this.useTurnServer = false;
    this.pendingIceCandidates = [];
    
    // Reset retry counts
    webrtcErrorHandler.resetRetryCount('connection');
    webrtcErrorHandler.resetRetryCount('ice');
    webrtcErrorHandler.resetRetryCount('start_call');
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
        reject(new Error('Not connected to call service. Please check your internet connection.'));
        return;
      }

      if (!this.socket.connected) {
        reject(new Error('Socket not connected. Please wait a moment and try again.'));
        return;
      }

      if (!this.userId) {
        reject(new Error('User not authenticated. Please log in again.'));
        return;
      }

      // Set timeout for call initiation
      const timeout = setTimeout(() => {
        reject(new Error('Call initiation timeout. Please try again.'));
      }, 10000);

      this.socket.emit('call:initiate', { 
        bookingId: callData.bookingId,
        callerType: 'user' // Add callerType for backend validation
      }, (response?: { status: string; message?: string; errorCode?: string }) => {
        clearTimeout(timeout);
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

