// routes/relay.ts
// POST /relay handler — MVP accepts balance transfers

import { Router, Request, Response } from 'express';
import { submitBalanceTransfer, getApi } from '../services/chain.js';
import { CONFIG } from '../config.js';

const router = Router();

interface RelayRequest {
  user: string;
  recipient: string;
  amount: string; // Will be parsed as BigInt
  action_type?: string;
  nonce?: number;
  signature?: string;
  pubkey?: string;
  contract?: string;
}

/**
 * POST /relay
 * MVP: Accept a simple balance transfer request
 * 
 * Request body:
 * {
 *   "user": "AccountId",
 *   "recipient": "AccountId",
 *   "amount": "1000000000000" (as string)
 * }
 */
router.post('/relay', async (req: Request, res: Response) => {
  try {
    const body = req.body as RelayRequest;
    
    // Validate required fields
    if (!body.recipient || !body.amount) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: recipient, amount',
      });
    }

    console.log(`[/relay] Request from user: ${body.user}, to: ${body.recipient}`);

    // Parse amount as BigInt
    const amount = BigInt(body.amount);

    // Submit transaction
    const txHash = await submitBalanceTransfer(body.recipient, amount);

    res.json({
      status: 'pending',
      tx_hash: txHash,
      message: 'Transaction submitted and finalized',
    });

  } catch (err) {
    console.error('[/relay] Error:', err);
    res.status(500).json({
      status: 'error',
      message: err instanceof Error ? err.message : 'Internal server error',
    });
  }
});

export default router;
