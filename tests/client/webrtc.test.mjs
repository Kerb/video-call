// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebRTCClient } from '../../client/webrtc.js';

class FakeRTCPeerConnection {
  constructor(config) {
    this.config = config;
    this.tracks = [];
    this.senders = [];
    this.candidates = [];
    this.localDescription = null;
    this.remoteDescription = null;
    this.iceGatheringState = 'complete';
    this.connectionState = 'new';
    this.signalingState = 'stable';
    this.onicecandidate = null;
    this.ontrack = null;
    this.onconnectionstatechange = null;
    this.closed = false;
  }

  addTrack(track, stream) {
    this.tracks.push(track);
    const sender = { track, replaceTrack: vi.fn(async (newTrack) => { sender.track = newTrack; }) };
    this.senders.push(sender);
  }

  async createOffer() {
    this.signalingState = 'have-local-offer';
    return { type: 'offer', sdp: 'fake-offer' };
  }

  async createAnswer() {
    return { type: 'answer', sdp: 'fake-answer' };
  }

  async setLocalDescription(description) {
    this.localDescription = description;
  }

  async setRemoteDescription(description) {
    this.remoteDescription = description;
    this.signalingState = 'stable';
  }

  async addIceCandidate(candidate) {
    this.candidates.push(candidate);
  }

  getSenders() {
    return this.senders;
  }

  close() {
    this.closed = true;
  }

  setConnectionState(state) {
    this.connectionState = state;
    if (this.onconnectionstatechange) this.onconnectionstatechange();
  }

  emitTrack(stream) {
    if (this.ontrack) this.ontrack({ streams: [stream] });
  }

  emitCandidate(candidate) {
    if (this.onicecandidate) this.onicecandidate({ candidate });
  }
}

vi.stubGlobal('RTCPeerConnection', FakeRTCPeerConnection);
vi.stubGlobal('RTCSessionDescription', class RTCSessionDescription {
  constructor(description) { Object.assign(this, description); }
});
vi.stubGlobal('RTCIceCandidate', class RTCIceCandidate {
  constructor(candidate) { Object.assign(this, candidate); }
});

class FakeStream {
  constructor(tracks) {
    this.tracks = tracks;
  }
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
  getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
  addTrack(track) { this.tracks.push(track); }
  removeTrack(track) { this.tracks = this.tracks.filter(t => t !== track); }
}

const makeTrack = (kind) => ({ kind, enabled: true, stop: vi.fn() });

function makeApp() {
  return {
    sessionId: 'me',
    participants: new Map(),
    socket: {
      sendOffer: vi.fn(),
      sendAnswer: vi.fn(),
      sendIceCandidate: vi.fn()
    },
    ui: { addRemoteVideo: vi.fn() }
  };
}

describe('WebRTCClient', () => {
  let app;
  let client;
  let localStream;

  beforeEach(() => {
    app = makeApp();
    client = new WebRTCClient(app);
    localStream = new FakeStream([makeTrack('video'), makeTrack('audio')]);
    client.localStream = localStream;
  });

  describe('createPeerConnection', () => {
    it('инициатор добавляет треки, создаёт offer и отправляет его', async () => {
      const pc = await client.createPeerConnection('peer-1', 'Bob', true);

      expect(pc.tracks.length).toBe(2);
      expect(pc.localDescription).toEqual({ type: 'offer', sdp: 'fake-offer' });
      expect(app.socket.sendOffer).toHaveBeenCalledWith('peer-1', { type: 'offer', sdp: 'fake-offer' });
    });

    it('не-инициатор ждёт входящего offer', async () => {
      await client.createPeerConnection('peer-1', 'Bob', false);
      expect(app.socket.sendOffer).not.toHaveBeenCalled();
    });

    it('конфигурация содержит STUN-серверы', async () => {
      const pc = await client.createPeerConnection('peer-1', 'Bob', false);
      expect(pc.config.iceServers.length).toBeGreaterThan(0);
      expect(pc.config.iceServers[0].urls).toMatch(/^stun:/);
    });

    it('ontrack отображает удалённое видео', async () => {
      const pc = await client.createPeerConnection('peer-1', 'Bob', false);
      const remote = new FakeStream([]);
      pc.emitTrack(remote);
      expect(app.ui.addRemoteVideo).toHaveBeenCalledWith('peer-1', 'Bob', remote);
    });

    it('ICE-кандидат отправляется пиру', async () => {
      const pc = await client.createPeerConnection('peer-1', 'Bob', false);
      pc.emitCandidate({ candidate: 'c1' });
      expect(app.socket.sendIceCandidate).toHaveBeenCalledWith('peer-1', { candidate: 'c1' });
    });
  });

  describe('handleOffer', () => {
    it('создаёт pc при необходимости и отвечает', async () => {
      app.participants.set('peer-1', { sessionId: 'peer-1', name: 'Bob' });
      await client.handleOffer('peer-1', { type: 'offer', sdp: 'incoming' });

      const pc = client.peerConnections.get('peer-1');
      expect(pc).toBeTruthy();
      expect(pc.remoteDescription).toEqual({ type: 'offer', sdp: 'incoming' });
      expect(app.socket.sendAnswer).toHaveBeenCalledWith('peer-1', { type: 'answer', sdp: 'fake-answer' });
    });

    it('использует существующий pc, если он уже есть', async () => {
      const existing = await client.createPeerConnection('peer-1', 'Bob', false);
      await client.handleOffer('peer-1', { type: 'offer', sdp: 'incoming' });
      expect(client.peerConnections.get('peer-1')).toBe(existing);
      expect(existing.remoteDescription).toEqual({ type: 'offer', sdp: 'incoming' });
    });
  });

  describe('handleAnswer', () => {
    it('применяет answer к существующему соединению', async () => {
      const pc = await client.createPeerConnection('peer-1', 'Bob', true);
      await client.handleAnswer('peer-1', { type: 'answer', sdp: 'a' });
      expect(pc.remoteDescription).toEqual({ type: 'answer', sdp: 'a' });
    });

    it('игнорирует answer без соединения', async () => {
      await client.handleAnswer('unknown', { type: 'answer' });
      expect(client.peerConnections.size).toBe(0);
    });
  });

  describe('addIceCandidate', () => {
    it('буферизует кандидата до создания pc и добавляет после connect', async () => {
      await client.addIceCandidate('peer-1', { candidate: 'early' });
      expect(client.localCandidates.get('peer-1')).toEqual([{ candidate: 'early' }]);

      const pc = await client.createPeerConnection('peer-1', 'Bob', false);
      pc.setConnectionState('connected');

      expect(pc.candidates).toEqual([{ candidate: 'early' }]);
      expect(client.localCandidates.has('peer-1')).toBe(false);
    });

    it('добавляет кандидата сразу, если pc существует', async () => {
      const pc = await client.createPeerConnection('peer-1', 'Bob', false);
      await client.addIceCandidate('peer-1', { candidate: 'direct' });
      expect(pc.candidates).toEqual([{ candidate: 'direct' }]);
    });
  });

  describe('closePeerConnection / closeAllConnections', () => {
    it('закрывает соединение и чистит состояние', async () => {
      const pc = await client.createPeerConnection('peer-1', 'Bob', false);
      client.closePeerConnection('peer-1');

      expect(pc.closed).toBe(true);
      expect(pc.onicecandidate).toBe(null);
      expect(client.peerConnections.size).toBe(0);
    });

    it('closeAllConnections закрывает всё', async () => {
      await client.createPeerConnection('p1', 'A', false);
      await client.createPeerConnection('p2', 'B', false);
      client.closeAllConnections();
      expect(client.peerConnections.size).toBe(0);
    });
  });

  describe('recreatePeerConnection', () => {
    it('инициатор выбирается детерминированно по sessionId', async () => {
      app.sessionId = 'zzz';
      await client.recreatePeerConnection('peer-1', 'Bob');
      expect(app.socket.sendOffer).toHaveBeenCalledTimes(1);

      app.socket.sendOffer.mockClear();
      app.sessionId = 'aaa';
      await client.recreatePeerConnection('peer-1', 'Bob');
      expect(app.socket.sendOffer).not.toHaveBeenCalled();
    });
  });

  describe('toggleAudio / toggleVideo', () => {
    it('переключает enabled у соответствующих треков', () => {
      client.toggleAudio(false);
      expect(localStream.getAudioTracks()[0].enabled).toBe(false);
      expect(localStream.getVideoTracks()[0].enabled).toBe(true);

      client.toggleVideo(false);
      expect(localStream.getVideoTracks()[0].enabled).toBe(false);

      client.toggleAudio(true);
      client.toggleVideo(true);
      expect(localStream.getAudioTracks()[0].enabled).toBe(true);
      expect(localStream.getVideoTracks()[0].enabled).toBe(true);
    });
  });

  describe('toggleScreenShare', () => {
    it('заменяет видео-трек у всех отправителей и вешает onended', async () => {
      const pc = await client.createPeerConnection('peer-1', 'Bob', false);
      const screenTrack = { kind: 'video', onended: null };
      vi.stubGlobal('navigator', {
        mediaDevices: {
          getDisplayMedia: vi.fn(async () => new FakeStream([screenTrack]))
        }
      });

      const result = await client.toggleScreenShare();
      expect(result).toBe(true);
      expect(pc.getSenders()[0].replaceTrack).toHaveBeenCalledWith(screenTrack);
      expect(localStream.getVideoTracks()[0]).toBe(screenTrack);
      expect(typeof screenTrack.onended).toBe('function');
    });
  });

  describe('waitForIceGathering', () => {
    it('резолвится по таймауту, если gathering не завершается', async () => {
      vi.useFakeTimers();
      const pc = {
        iceGatheringState: 'gathering',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      let settled = false;
      const pending = client.waitForIceGathering(pc).then(() => { settled = true; });
      vi.advanceTimersByTime(2100);
      await pending;
      expect(settled).toBe(true);
    });
  });
});
