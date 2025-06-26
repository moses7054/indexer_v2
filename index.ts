import {
  Connection,
  PublicKey,
  clusterApiUrl,
  type GetProgramAccountsConfig,
} from "@solana/web3.js";
import * as borsh from "borsh";
import * as fs from "fs";
import path from "path";
import { exit } from "process";

const PROGRAM_ID = "TRBZyQHB3m68FGeVsqTK39Wm4xejadjVhP5MAZaKWDM";
if (PROGRAM_ID === "Enter Program ID here") {
  console.error("Program ID is not set, exiting...");
  exit(1);
}

// Function for batching into 100
function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// Function for getting account details, takes in the batch
async function getAccountDetails(batch: PublicKey[]): Promise<any> {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const accountDetails = await connection.getMultipleAccountsInfo(batch);
  console.log("accountDetails", accountDetails);
  return accountDetails;
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

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

let programId = new PublicKey(PROGRAM_ID);

let config: GetProgramAccountsConfig = {
  commitment: "finalized",
  filters: [
    {
      dataSize: 72,
    },
  ],
};

let accounts = await connection.getProgramAccounts(programId, config);

const pdasOfAccount = accounts.map((account) => {
  return account.pubkey;
});

console.log("pdasOfAccount", pdasOfAccount);

const batches = chunkArray(pdasOfAccount, 100);
console.log("batches", batches);
const details: any[] = [];

for (const batch of batches) {
  const batchDetails = await getAccountDetails(batch);
  details.push(...batchDetails);
}
console.log("details", details);

let finalDetails = details.map((detail) => {
  return deserializeAccount(detail);
});

console.log("finalDetails", finalDetails);

// Save to CSV file with timestamp
const now = new Date();
const timestamp = now
  .toLocaleString("en-GB")
  .replace(/[/:]/g, "-")
  .replace(", ", "_");
const csvFilename = `application_accounts_${timestamp}.csv`;
saveToCSV(finalDetails, csvFilename);
