import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";

interface Player {
  id: string;
  name: string;
  score: number | null;
  finished: boolean;
  timeTaken: number | null;
}

interface Room {
  id: string;
  hostId: string;
  players: Player[];
  status: 'lobby' | 'playing' | 'leaderboard';
  examData: any[];
  settings: {
    durationMinutes: number;
    randomizeQuestions: boolean;
    instantFeedback: boolean;
  };
  startTime?: number;
}

const rooms = new Map<string, Room>();

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("createRoom", (data: { name: string }, callback) => {
      const roomId = generateRoomCode();
      const newRoom: Room = {
        id: roomId,
        hostId: socket.id,
        players: [{ id: socket.id, name: data.name, score: null, finished: false, timeTaken: null }],
        status: 'lobby',
        examData: [],
        settings: {
          durationMinutes: 30,
          randomizeQuestions: false,
          instantFeedback: false,
        }
      };
      rooms.set(roomId, newRoom);
      socket.join(roomId);
      callback({ success: true, roomId, room: newRoom });
    });

    socket.on("joinRoom", (data: { roomId: string, name: string }, callback) => {
      const room = rooms.get(data.roomId);
      if (!room) {
        callback({ success: false, message: "Room not found" });
        return;
      }
      if (room.status !== 'lobby') {
        callback({ success: false, message: "Exam already started" });
        return;
      }
      if (room.players.find(p => p.name === data.name)) {
        callback({ success: false, message: "Name already taken in this room" });
        return;
      }

      room.players.push({ id: socket.id, name: data.name, score: null, finished: false, timeTaken: null });
      socket.join(data.roomId);
      io.to(data.roomId).emit("roomUpdated", room);
      callback({ success: true, room });
    });

    socket.on("updateExamData", (data: { roomId: string, examData: any[], settings: any }) => {
      const room = rooms.get(data.roomId);
      if (room && room.hostId === socket.id) {
        room.examData = data.examData;
        room.settings = data.settings;
        io.to(data.roomId).emit("roomUpdated", room);
      }
    });

    socket.on("startExam", (data: { roomId: string }) => {
      const room = rooms.get(data.roomId);
      if (room && room.hostId === socket.id) {
        room.status = 'playing';
        room.startTime = Date.now();
        io.to(data.roomId).emit("examStarted", room);
      }
    });

    socket.on("submitExam", (data: { roomId: string, score: number, timeTaken: number }) => {
      const room = rooms.get(data.roomId);
      if (room) {
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
          player.score = data.score;
          player.finished = true;
          player.timeTaken = data.timeTaken;
          
          const allFinished = room.players.every(p => p.finished);
          if (allFinished) {
            room.status = 'leaderboard';
          }
          
          io.to(data.roomId).emit("roomUpdated", room);
        }
      }
    });

    socket.on("restartExam", (data: { roomId: string }) => {
      const room = rooms.get(data.roomId);
      if (room && room.hostId === socket.id) {
        room.status = 'lobby';
        room.startTime = undefined;
        room.players.forEach(p => {
          p.score = null;
          p.finished = false;
          p.timeTaken = null;
        });
        io.to(data.roomId).emit("roomUpdated", room);
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      // Clean up rooms where this socket was the host or a player
      rooms.forEach((room, roomId) => {
        if (room.hostId === socket.id) {
          // If host disconnects, maybe end the room or reassign host?
          // For simplicity, let's just remove the room and notify others
          io.to(roomId).emit("roomClosed", { message: "Host disconnected" });
          rooms.delete(roomId);
        } else {
          const playerIndex = room.players.findIndex(p => p.id === socket.id);
          if (playerIndex !== -1) {
            room.players.splice(playerIndex, 1);
            io.to(roomId).emit("roomUpdated", room);
          }
        }
      });
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
