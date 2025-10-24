import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import express from "express";
import path from "path";

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve static files from public directory
  // This makes /audio, /charts, /js folders accessible
  app.use(express.static(path.join(process.cwd(), 'public')));
  
  // Serve the game at the root path
  app.get('/', (_req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  });

  const httpServer = createServer(app);

  return httpServer;
}
