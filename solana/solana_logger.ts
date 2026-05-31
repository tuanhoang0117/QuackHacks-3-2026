// node-fetch polyfill required for @solana/web3.js on Node v26
import fetch from "node-fetch";
(global as any).fetch = fetch;

import {
  Connection,
  Keypair,
  Transaction,
  TransactionInstruction,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

// IMPORTANT: auditHash MUST already be a SHA-256 hex digest produced by FastAPI.
// Never pass raw medication names, patient IDs, or clinical text into this function.
export async function logAuditToSolana(
  auditHash: string,
  statusTag: string
): Promise<string> {
  const connection = new Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  const secretKeyString = process.env.SOLANA_PRIVATE_KEY || "";
  if (!secretKeyString) {
    throw new Error("SOLANA_PRIVATE_KEY not set in environment.");
  }

  const feePayer = Keypair.fromSecretKey(bs58.decode(secretKeyString));
  const MEMO_PROGRAM_ID = new PublicKey(
    "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
  );

  // Memo contains ONLY a non-identifying status tag + the opaque hash — no PHI.
  const memoPayload = `${statusTag}|${auditHash}`;

  const memoInstruction = new TransactionInstruction({
    keys: [{ pubkey: feePayer.publicKey, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memoPayload, "utf-8"),
  });

  const transaction = new Transaction().add(memoInstruction);
  const txSignature = await sendAndConfirmTransaction(connection, transaction, [
    feePayer,
  ]);

  return `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`;
}

// CLI entry point — called by FastAPI via subprocess:
// npx ts-node solana_logger.ts <auditHash> <statusTag>
if (require.main === module) {
  const [, , auditHash, statusTag] = process.argv;

  if (!auditHash || !statusTag) {
    console.error("Usage: ts-node solana_logger.ts <auditHash> <statusTag>");
    process.exit(1);
  }

  // Load .env from backend directory
  require("dotenv").config({ path: "../backend/.env" });

  logAuditToSolana(auditHash, statusTag)
    .then((url) => {
      console.log(url);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Solana log failed:", err.message);
      process.exit(1);
    });
}
