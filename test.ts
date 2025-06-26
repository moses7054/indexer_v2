import {
  Connection,
  PublicKey,
  clusterApiUrl,
  type SignaturesForAddressOptions,
  type GetProgramAccountsConfig,
} from "@solana/web3.js";
import * as borsh from "borsh";
import * as fs from "fs";
import path from "path";
import { exit } from "process";

const PROGRAM_ID = "TRBZyQHB3m68FGeVsqTK39Wm4xejadjVhP5MAZaKWDM";

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  maxRetries: 5,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  batchDelay: 2000, // 2 seconds between batches
  requestDelay: 100, // 100ms between individual requests
};

// Utility function for exponential backoff delay
function getBackoffDelay(attempt: number): number {
  const delay = Math.min(
    RATE_LIMIT_CONFIG.baseDelay * Math.pow(2, attempt),
    RATE_LIMIT_CONFIG.maxDelay
  );
  return delay + Math.random() * 1000; // Add jitter
}

// Utility function to check if error is rate limit related
function isRateLimitError(error: any): boolean {
  const errorMessage = error?.message?.toLowerCase() || "";
  const errorCode = error?.code;

  return (
    errorMessage.includes("too many requests") ||
    errorMessage.includes("rate limit") ||
    errorMessage.includes("429") ||
    errorCode === 429 ||
    errorMessage.includes("throttled") ||
    errorMessage.includes("quota exceeded")
  );
}

// Utility function to sleep
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Function for getting the latest signature for a PDA with retry logic
async function getLatestSignature(
  pda: PublicKey,
  retryCount: number = 0
): Promise<{ slot: number; signature: string } | null> {
  try {
    // Add delay between requests to avoid overwhelming the API
    if (retryCount === 0) {
      await sleep(RATE_LIMIT_CONFIG.requestDelay);
    }

    const signaturesOptions: SignaturesForAddressOptions = {
      limit: 1,
    };

    const signatures = await connection.getSignaturesForAddress(
      pda,
      signaturesOptions
    );

    if (signatures.length > 0) {
      return {
        slot: signatures[0].slot,
        signature: signatures[0].signature,
      };
    }
    return null;
  } catch (error) {
    console.error(
      `Error getting signature for PDA ${pda.toBase58()} (attempt ${
        retryCount + 1
      }):`,
      error
    );

    // Check if it's a rate limit error
    if (isRateLimitError(error) && retryCount < RATE_LIMIT_CONFIG.maxRetries) {
      const delay = getBackoffDelay(retryCount);
      console.log(`Rate limit hit, retrying in ${delay}ms...`);
      await sleep(delay);
      return getLatestSignature(pda, retryCount + 1);
    }

    // For non-rate-limit errors, still retry a few times
    if (retryCount < 2) {
      const delay = getBackoffDelay(retryCount);
      console.log(`Retrying in ${delay}ms...`);
      await sleep(delay);
      return getLatestSignature(pda, retryCount + 1);
    }

    return null;
  }
}

// Function for batching into 100
function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// Function for getting account details with retry logic
async function getAccountDetailsWithRetry(
  batch: PublicKey[],
  retryCount: number = 0
): Promise<any[]> {
  try {
    const accountDetails = await connection.getMultipleAccountsInfo(batch);
    return accountDetails;
  } catch (error) {
    console.error(
      `Error getting account details (attempt ${retryCount + 1}):`,
      error
    );

    if (isRateLimitError(error) && retryCount < RATE_LIMIT_CONFIG.maxRetries) {
      const delay = getBackoffDelay(retryCount);
      console.log(`Rate limit hit, retrying account details in ${delay}ms...`);
      await sleep(delay);
      return getAccountDetailsWithRetry(batch, retryCount + 1);
    }

    if (retryCount < 2) {
      const delay = getBackoffDelay(retryCount);
      console.log(`Retrying account details in ${delay}ms...`);
      await sleep(delay);
      return getAccountDetailsWithRetry(batch, retryCount + 1);
    }

    throw error;
  }
}

// Function for getting account details and signatures with rate limiting
async function getAccountDetailsAndSignatures(batch: PublicKey[]): Promise<{
  accountDetails: any[];
  signatures: Array<{ slot: number; signature: string } | null>;
}> {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  // Get account details with retry logic
  const accountDetails = await getAccountDetailsWithRetry(batch);

  // Get signatures for each PDA with sequential processing to avoid overwhelming the API
  const signatures: Array<{ slot: number; signature: string } | null> = [];

  for (const pda of batch) {
    const signature = await getLatestSignature(pda);
    signatures.push(signature);
  }

  console.log("accountDetails", accountDetails);
  console.log("signatures", signatures);

  return { accountDetails, signatures };
}

// function for deserializing account
function deserializeAccount(account: any) {
  class ApplicationAccount {
    user: Uint8Array;
    bump: number;
    pre_req_ts: boolean;
    pre_req_rs: boolean;
    github: string;

    constructor(fields: {
      user: Uint8Array;
      bump: number;
      pre_req_ts: boolean;
      pre_req_rs: boolean;
      github: string;
    }) {
      this.user = fields.user;
      this.bump = fields.bump;
      this.pre_req_ts = fields.pre_req_ts;
      this.pre_req_rs = fields.pre_req_rs;
      this.github = fields.github;
    }
  }

  const schema = new Map([
    [
      ApplicationAccount,
      {
        kind: "struct",
        fields: [
          ["user", [32]],
          ["bump", "u8"],
          ["pre_req_ts", "u8"], // JS borsh doesn't support bool, use u8 and cast to boolean
          ["pre_req_rs", "u8"],
          ["github", "string"],
        ],
      },
    ],
  ]);

  // Skip the first 8 bytes (Anchor discriminator)
  const data = account.data.slice(8);

  try {
    const decoded = borsh.deserialize(schema, ApplicationAccount, data);
    // Convert u8 fields to boolean
    decoded.pre_req_ts = Boolean(decoded.pre_req_ts);
    decoded.pre_req_rs = Boolean(decoded.pre_req_rs);
    // Convert user to base58
    decoded.user = new PublicKey(decoded.user).toBase58();
    return decoded;
  } catch (e) {
    // Try to trim trailing zeroes and retry
    for (let i = data.length; i > 0; i--) {
      try {
        const trimmed = data.slice(0, i);
        const decoded = borsh.deserialize(schema, ApplicationAccount, trimmed);
        decoded.pre_req_ts = Boolean(decoded.pre_req_ts);
        decoded.pre_req_rs = Boolean(decoded.pre_req_rs);
        decoded.user = new PublicKey(decoded.user).toBase58();
        return decoded;
      } catch {}
    }
    throw e;
  }
}

function convertToCSV(data: any[]): string {
  if (data.length === 0) {
    return "";
  }

  // Get headers from the first object
  const headers = Object.keys(data[0]);

  // Create CSV header row
  const csvHeader = headers.join(",");

  // Create CSV data rows
  const csvRows = data.map((item) => {
    return headers
      .map((header) => {
        const value = item[header];
        // Handle values that might contain commas or quotes
        if (
          typeof value === "string" &&
          (value.includes(",") || value.includes('"'))
        ) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      })
      .join(",");
  });

  // Combine header and rows
  return [csvHeader, ...csvRows].join("\n");
}

function saveToCSV(
  data: any[],
  filename: string = "application_accounts.csv"
): void {
  const directory = "./output";

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const fullPath = path.join(directory, filename);

  try {
    const csvContent = convertToCSV(data);
    fs.writeFileSync(fullPath, csvContent, "utf8");
    console.log(`CSV file saved successfully: ${fullPath}`);
    console.log(`Total records: ${data.length}`);
  } catch (error) {
    console.error("Error saving CSV file:", error);
  }
}

// MAIN FUNCTION STARTS HERE

let programId = new PublicKey(PROGRAM_ID);

let config: GetProgramAccountsConfig = {
  commitment: "finalized",
  filters: [
    {
      dataSize: 72,
    },
  ],
};

// Get program accounts with retry logic
let accounts;
try {
  accounts = await connection.getProgramAccounts(programId, config);
} catch (error) {
  console.error("Error getting program accounts:", error);
  if (isRateLimitError(error)) {
    console.log("Rate limit hit on initial request, retrying with delay...");
    await sleep(RATE_LIMIT_CONFIG.baseDelay);
    accounts = await connection.getProgramAccounts(programId, config);
  } else {
    throw error;
  }
}

const pdasOfAccount = accounts.map((account) => {
  return account.pubkey;
});

console.log("pdasOfAccount length", pdasOfAccount.length);
console.log("pdasOfAccount", pdasOfAccount);

const batches: PublicKey[][] = chunkArray(pdasOfAccount, 50);
console.log("batches", batches);
const details: any[] = [];
const allSignatures: Array<{ slot: number; signature: string } | null> = [];

for (let i = 0; i < batches.length; i++) {
  const batch: PublicKey[] = batches[i];
  console.log(
    `Processing batch ${i + 1}/${batches.length} (${batch.length} accounts)`
  );

  const batchResult = await getAccountDetailsAndSignatures(batch);
  details.push(...batchResult.accountDetails);
  allSignatures.push(...batchResult.signatures);

  // Add delay between batches to avoid overwhelming the API
  if (i < batches.length - 1) {
    console.log(
      `Waiting ${RATE_LIMIT_CONFIG.batchDelay}ms before next batch...`
    );
    await sleep(RATE_LIMIT_CONFIG.batchDelay);
  }
}

console.log("details", details);
console.log("allSignatures", allSignatures);

// Combine account details with signatures and deserialize
let finalDetails = details.map((detail, index) => {
  const deserializedAccount = deserializeAccount(detail);
  const signatureInfo = allSignatures[index];

  return {
    pda: pdasOfAccount[index].toBase58(),
    slot: signatureInfo?.slot || 0,
    signature: signatureInfo?.signature || "",
    user_wallet: deserializedAccount.user,
    bump: deserializedAccount.bump,
    pre_req_ts: deserializedAccount.pre_req_ts,
    pre_req_rs: deserializedAccount.pre_req_rs,
    github: deserializedAccount.github,
  };
});

console.log("finalDetails", finalDetails);

// Save to CSV file with timestamp
const now = new Date();
const timestamp = now
  .toLocaleString("en-GB")
  .replace(/[/:]/g, "-")
  .replace(", ", "_");
const csvFilename = `time_stamped_accounts_${timestamp}.csv`;
saveToCSV(finalDetails, csvFilename);
