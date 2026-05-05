// index.ts
// Relayer Service Entry Point — Phase 1 MVP

import express from 'express';
import { initChain } from './services/chain.js';
import relayRouter from './routes/relay.js';
import { CONFIG } from './config.js';

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use('/', relayRouter);

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Error handler
 */
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Error]', err);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
});

/**
 * Start relayer service
 */
async function main() {
  try {
    // Initialize chain connection
    await initChain();

    // Start Express server
    app.listen(CONFIG.PORT, () => {
      console.log(`[Server] Relayer listening on http://localhost:${CONFIG.PORT}`);
      console.log(`[Server] POST /relay — submit transactions`);
      console.log(`[Server] GET /health — health check`);
    });

  } catch (err) {
    console.error('[Fatal Error]', err);
    process.exit(1);
  }
}

main();
