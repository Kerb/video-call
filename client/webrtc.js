/**
 * WebRTC Client Module
 * Handles PeerConnection, media streams, and mesh topology
 */
export class WebRTCClient {
  constructor(app) {
    this.app = app;
    this.localStream = null;
    this.peerConnections = new Map(); // sessionId -> RTCPeerConnection
    this.localCandidates = new Map(); // sessionId -> ICE candidates queue
    
    // STUN серверы (Google public)
    this.iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }

  /**
   * Получение локального медиа-потока
   */
  async getLocalStream() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      console.log('[WebRTC] Local stream obtained');
      return this.localStream;
    } catch (error) {
      console.error('[WebRTC] Get user media error:', error);
      throw error;
    }
  }

  /**
   * Остановка локального потока
   */
  stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
      console.log('[WebRTC] Local stream stopped');
    }
  }

  /**
   * Создание PeerConnection для участника
   * @param {string} sessionId - ID сессии участника
   * @param {string} name - Имя участника
   * @param {boolean} isInitiator - Являемся ли мы инициатором соединения
   */
  async createPeerConnection(sessionId, name, isInitiator = false) {
    console.log('[WebRTC] Creating peer connection for:', sessionId);

    const pc = new RTCPeerConnection(this.iceServers);
    this.peerConnections.set(sessionId, pc);

    // Добавляем локальные треки в соединение
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    // Обработка ICE кандидатов
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] ICE candidate generated');
        this.app.socket.sendIceCandidate(sessionId, event.candidate);
      }
    };

    // Обработка удалённых треков
    pc.ontrack = (event) => {
      console.log('[WebRTC] Remote track received from:', sessionId);
      const remoteStream = event.streams[0];
      this.app.ui.addRemoteVideo(sessionId, name, remoteStream);
    };

    // Мониторинг состояния соединения
    pc.onconnectionstatechange = async () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.log('[WebRTC] Connection failed, attempting to recreate...');
        await this.recreatePeerConnection(sessionId, name);
      }
      
      if (pc.connectionState === 'connected') {
        // Отправляем накопленные ICE кандидаты если они есть
        const candidates = this.localCandidates.get(sessionId);
        if (candidates) {
          for (const candidate of candidates) {
            pc.addIceCandidate(candidate).catch(console.error);
          }
          this.localCandidates.delete(sessionId);
        }
      }
    };

    // Если мы инициатор - создаём offer
    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log('[WebRTC] Offer created and set as local');
        
        // Ждём пока ICE gathering завершится
        await this.waitForIceGathering(pc);
        
        // Отправляем offer другому пиру
        this.app.socket.sendOffer(sessionId, pc.localDescription);
      } catch (error) {
        console.error('[WebRTC] Create offer error:', error);
        throw error;
      }
    }

    return pc;
  }

  /**
   * Обработка полученного offer
   */
  async handleOffer(sessionId, offer) {
    console.log('[WebRTC] Handling offer from:', sessionId);
    
    let pc = this.peerConnections.get(sessionId);
    
    if (!pc) {
      const participant = this.app.participants.get(sessionId);
      pc = await this.createPeerConnection(sessionId, participant?.name || 'Unknown', false);
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('[WebRTC] Remote description (offer) set');

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('[WebRTC] Answer created and set as local');
      
      // Ждём пока ICE gathering завершится
      await this.waitForIceGathering(pc);
      
      // Отправляем answer
      this.app.socket.sendAnswer(sessionId, pc.localDescription);
    } catch (error) {
      console.error('[WebRTC] Handle offer error:', error);
      throw error;
    }
  }

  /**
   * Обработка полученного answer
   */
  async handleAnswer(sessionId, answer) {
    console.log('[WebRTC] Handling answer from:', sessionId);
    
    const pc = this.peerConnections.get(sessionId);
    if (!pc) {
      console.warn('[WebRTC] No peer connection for:', sessionId);
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('[WebRTC] Remote description (answer) set');
    } catch (error) {
      console.error('[WebRTC] Handle answer error:', error);
      throw error;
    }
  }

  /**
   * Добавление ICE кандидата
   */
  async addIceCandidate(sessionId, candidate) {
    const pc = this.peerConnections.get(sessionId);
    if (!pc) {
      // Сохраняем кандидата для последующего добавления
      if (!this.localCandidates.has(sessionId)) {
        this.localCandidates.set(sessionId, []);
      }
      this.localCandidates.get(sessionId).push(candidate);
      console.log('[WebRTC] ICE candidate queued for:', sessionId);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('[WebRTC] ICE candidate added');
    } catch (error) {
      console.error('[WebRTC] Add ICE candidate error:', error);
    }
  }

  /**
   * Закрытие PeerConnection для участника
   */
  closePeerConnection(sessionId) {
    const pc = this.peerConnections.get(sessionId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      this.peerConnections.delete(sessionId);
      this.localCandidates.delete(sessionId);
      console.log('[WebRTC] Peer connection closed for:', sessionId);
    }
  }

  /**
   * Закрытие всех соединений
   */
  closeAllConnections() {
    for (const sessionId of this.peerConnections.keys()) {
      this.closePeerConnection(sessionId);
    }
    console.log('[WebRTC] All peer connections closed');
  }

  /**
   * Воссоздание PeerConnection после разрыва
   */
  async recreatePeerConnection(sessionId, name) {
    console.log('[WebRTC] Recreating peer connection for:', sessionId);

    this.closePeerConnection(sessionId);

    // Инициатора выбираем детерминированно, чтобы при одновременном
    // пересоздании с обеих сторон offer отправлял только один пир
    const isInitiator = this.app.sessionId > sessionId;
    await this.createPeerConnection(sessionId, name, isInitiator);
  }

  /**
   * Ожидание завершения ICE gathering
   */
  waitForIceGathering(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const checkState = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };

      pc.addEventListener('icegatheringstatechange', checkState);
      
      // Таймаут на случай если событие не сработает
      setTimeout(resolve, 2000);
    });
  }

  /**
   * Включение/выключение аудио
   */
  toggleAudio(enabled) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
      console.log('[WebRTC] Audio', enabled ? 'enabled' : 'disabled');
    }
  }

  /**
   * Включение/выключение видео
   */
  toggleVideo(enabled) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
      console.log('[WebRTC] Video', enabled ? 'enabled' : 'disabled');
    }
  }

  /**
   * Демонстрация экрана
   */
  async toggleScreenShare() {
    if (!this.localStream) return false;

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });

      const screenTrack = screenStream.getVideoTracks()[0];
      const videoTrack = this.localStream.getVideoTracks()[0];

      // Заменяем видео-трек во всех PeerConnection
      for (const [sessionId, pc] of this.peerConnections.entries()) {
        const sender = pc.getSenders().find(s => 
          s.track && s.track.kind === videoTrack.kind
        );
        
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
      }

      // Обновляем локальный стрим
      this.localStream.removeTrack(videoTrack);
      this.localStream.addTrack(screenTrack);

      // Обработка остановки демонстрации
      screenTrack.onended = () => {
        this.toggleScreenShareOff();
      };

      console.log('[WebRTC] Screen share started');
      return true;
    } catch (error) {
      console.error('[WebRTC] Screen share error:', error);
      return false;
    }
  }

  /**
   * Остановка демонстрации экрана
   */
  async toggleScreenShareOff() {
    if (!this.localStream) return;

    try {
      // Получаем новый поток с камеры
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true
      });
      
      const cameraTrack = cameraStream.getVideoTracks()[0];
      const screenTrack = this.localStream.getVideoTracks()[0];

      // Заменяем трек обратно
      for (const [sessionId, pc] of this.peerConnections.entries()) {
        const sender = pc.getSenders().find(s => 
          s.track && s.track.kind === cameraTrack.kind
        );
        
        if (sender) {
          sender.replaceTrack(cameraTrack);
        }
      }

      // Останавливаем экран и обновляем локальный стрим
      screenTrack.stop();
      this.localStream.removeTrack(screenTrack);
      this.localStream.addTrack(cameraTrack);

      console.log('[WebRTC] Screen share stopped');
    } catch (error) {
      console.error('[WebRTC] Stop screen share error:', error);
    }
  }

  /**
   * Выбор устройства (камера/микрофон)
   */
  async switchDevice(kind, deviceId) {
    const constraints = {
      [kind]: {
        deviceId: { exact: deviceId }
      }
    };

    try {
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = newStream[kind === 'video' ? 'getVideoTracks' : 'getAudioTracks']()[0];
      const oldTrack = this.localStream[kind === 'video' ? 'getVideoTracks' : 'getAudioTracks']()[0];

      // Заменяем трек во всех PeerConnection
      for (const [sessionId, pc] of this.peerConnections.entries()) {
        const sender = pc.getSenders().find(s => 
          s.track && s.track.kind === newTrack.kind
        );
        
        if (sender) {
          sender.replaceTrack(newTrack);
        }
      }

      // Обновляем локальный стрим
      this.localStream.removeTrack(oldTrack);
      this.localStream.addTrack(newTrack);
      oldTrack.stop();

      console.log('[WebRTC] Device switched:', kind, deviceId);
    } catch (error) {
      console.error('[WebRTC] Switch device error:', error);
      throw error;
    }
  }

  /**
   * Получение списка доступных устройств
   */
  async getDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      const audioDevices = devices.filter(d => d.kind === 'audioinput');
      
      return { videoDevices, audioDevices };
    } catch (error) {
      console.error('[WebRTC] Get devices error:', error);
      return { videoDevices: [], audioDevices: [] };
    }
  }
}
