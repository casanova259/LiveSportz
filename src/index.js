import express from "express";
import http from "http";
import { matchRouter } from "./routes/matches.js";
import { attachWebSocketServer } from "./ws/server.js";
import { securityMiddleWare } from "./arcjet.js";
import { commentaryRouter } from "./routes/commentary.js";
import cors from "cors";

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    credentials: true,
  })
);
const server = http.createServer(app);

// app.use(securityMiddleWare());

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello from Express Server");
});

app.use("/matches", matchRouter);
app.use('/matches/:id/commentary', commentaryRouter)

const { broadcastMatchCreated, broadcastCommentary } = attachWebSocketServer(server);

app.locals.broadcastMatchCreated = broadcastMatchCreated;
app.locals.broadcastCommentary = broadcastCommentary;

server.listen(PORT, HOST, () => {
  const baseUrl =
    HOST === "0.0.0.0" ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;

  console.log(`Server is Running on ${baseUrl}`);
  console.log(
    `Websocket Server is Running on ${baseUrl.replace("http", "ws")}/ws`,
  );
});
