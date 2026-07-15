import './lib/dns.js'; // must be first: fixes SRV lookup on Windows
import express from 'express';
import "dotenv/config.js";
import User from './models/user.model.js';
import {connectDB} from './lib/db.js';
import { clerkMiddleware } from "@clerk/express";
import cors from "cors";
import fs from "fs";
import path from "path";
import job from './lib/cron.js';
import clerkWebhook from './webhooks/clerk.webhook.js';
import authRoutes from './routes/auth.route.js';
import messageRoutes from './routes/message.route.js';
import { app, server } from './lib/socket.js';

const PORT = process.env.PORT || 3000;
const publicDir = path.join(process.cwd(), "public");
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

app.use("/api/webhooks/clerk",express.raw({type: "application/json"}) ,clerkWebhook);

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(clerkMiddleware());
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

if(fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get("/{*any}", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"), (err) => next(err));
  });
}

server.listen(PORT, () => {
  connectDB();
  console.log(`Server is running on port ${PORT}`);

  if(process.env.NODE_ENV === "production") {
    job.start();
  }
});