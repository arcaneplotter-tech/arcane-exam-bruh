export type ExamType = 'NORMAL' | 'QUICK';

export type GameSettings = {
  timePerQuestion: number;
  examType: ExamType;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showCorrectAnswer: boolean;
  canSkipQuestions: boolean;
  pointMultiplier: number;
  penaltyPoints: number;
};

export type Question = {
  id: string;
  text: string;
  options: string[];
  correctAnswer: string;
  timeLimit: number;
  explanation?: string;
};

export type Player = {
  id: string;
  name: string;
  score: number;
  hasAnswered: boolean;
  currentAnswer: string | null;
  connection: any; // DataConnection
  timeTaken?: number; // For QUICK mode
};

export type GameState = 'LOBBY' | 'STARTING' | 'QUESTION' | 'LEADERBOARD' | 'FINISHED' | 'QUICK_EXAM';

export type MessageType = 
  | { type: 'JOIN'; name: string }
  | { type: 'JOIN_SUCCESS'; playerId: string; gameState: GameState; settings?: GameSettings }
  | { type: 'JOIN_ERROR'; message: string }
  | { type: 'STATE_UPDATE'; state: GameState; data?: any }
  | { type: 'SUBMIT_ANSWER'; answer: string }
  | { type: 'SUBMIT_EXAM'; answers: Record<string, string>; timeTaken: number }
  | { type: 'ANSWER_RESULT'; correct: boolean; score: number; correctAnswer: string; explanation?: string }
  | { type: 'PLAYER_LIST'; players: { id: string; name: string; score: number; timeTaken?: number }[] };
