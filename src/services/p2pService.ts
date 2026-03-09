// Simple EventEmitter implementation for browser compatibility
class SimpleEventEmitter {
  private listeners: Record<string, Function[]> = {};

  on(event: string, callback: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  off(event: string, callback: Function) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event: string, data: any) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(cb => cb(data));
  }
}

// P2P Service to handle room state and communication
class P2PService extends SimpleEventEmitter {
  private room: any = null;
  private isHost: boolean = false;
  private playerName: string = '';
  private playerId: string = Math.random().toString(36).substring(2, 10);

  constructor() {
    super();
  }

  createRoom(name: string) {
    this.playerName = name;
    this.isHost = true;
    console.log('Creating room...');
    this.room = {
      id: Math.random().toString(36).substring(2, 8).toUpperCase(),
      players: [{ id: this.playerId, name, hostId: this.playerId }],
      hostId: this.playerId,
      status: 'lobby',
      examData: [],
      settings: { durationMinutes: 30 }
    };
    this.emit('roomUpdated', this.room);
  }

  joinRoom(roomId: string, name: string) {
    this.playerName = name;
    this.isHost = false;
    console.log(`Joining room ${roomId}...`);
    this.room = {
      id: roomId,
      players: [{ id: 'host', name: 'Host' }, { id: this.playerId, name, hostId: 'host' }],
      hostId: 'host',
      status: 'lobby',
      examData: [],
      settings: { durationMinutes: 30 }
    };
    this.emit('roomUpdated', this.room);
  }

  updateExamData(examData: any, settings: any) {
    if (!this.isHost) return;
    this.room.examData = examData;
    this.room.settings = settings;
    this.emit('roomUpdated', this.room);
  }

  startExam() {
    if (!this.isHost) return;
    this.room.status = 'playing';
    this.emit('examStarted', this.room);
  }

  submitExam(score: number, timeTaken: number) {
    console.log('Submitting exam:', score, timeTaken);
    // Broadcast submission to host
  }

  restartExam() {
    if (!this.isHost) return;
    this.room.status = 'lobby';
    this.emit('roomUpdated', this.room);
  }
}

export const p2pService = new P2PService();
