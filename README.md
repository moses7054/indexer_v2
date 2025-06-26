# Solana Program Account Indexer

This project fetches and deserializes Solana program accounts, then exports the data to a CSV file. It is designed to work with a specific program on the Solana Devnet.
Generated using llm.

## Features

- Fetches all accounts for a given program ID
- Deserializes account data using Borsh
- Exports the results to a timestamped CSV file in the `output` directory
- **NEW**: Signature tracking functionality to get the latest transaction signatures for each account

## Prerequisites

- Node.js (v16 or later recommended)
- Yarn package manager

## Installation

1. Install dependencies:
   ```bash
   yarn install
   ```

## Setup

1. Open `index.ts` or `test.ts` and replace the placeholder with your program ID:
   ```typescript
   const PROGRAM_ID = "Enter Program ID here";
   ```
   Change it to:
   ```typescript
   const PROGRAM_ID = "your_actual_program_id_here";
   ```

## Usage

### Basic Indexer (without signature tracking)

To run the basic indexer and export the accounts to CSV:

```bash
yarn index
```

### Enhanced Indexer (with signature tracking)

To run the enhanced indexer that includes signature tracking:

```bash
yarn test
```

**Note**: The enhanced version (`test.ts`) includes additional functionality to track the latest transaction signatures for each account, which provides more detailed information but may run slower due to additional API calls.

## Output

- The CSV file will contain all deserialized account data for the specified program.
- **Basic version**: Filename format: `application_accounts_<timestamp>.csv`
- **Enhanced version**: Filename format: `time_stamped_accounts_<timestamp>.csv`

### CSV Output Fields

**Basic version (`index.ts`)**:

- `user_wallet`: User's wallet address
- `bump`: PDA bump seed
- `pre_req_ts`: TypeScript prerequisite status
- `pre_req_rs`: Rust prerequisite status
- `github`: GitHub username

**Enhanced version (`test.ts`)**:

- `pda`: Program Derived Address
- `slot`: Latest transaction slot
- `signature`: Latest transaction signature
- `user_wallet`: User's wallet address
- `bump`: PDA bump seed
- `pre_req_ts`: TypeScript prerequisite status
- `pre_req_rs`: Rust prerequisite status
- `github`: GitHub username

## Customization

- You can change the program ID or filters by editing the relevant lines in `index.ts` or `test.ts`.
- The batch size for processing accounts is set to 100 by default and can be modified in the `chunkArray` function.

## File Structure

- `index.ts` - Basic indexer without signature tracking
- `test.ts` - Enhanced indexer with signature tracking
- `package.json` - Project configuration and scripts
- `output/` - Directory where CSV files are saved

---

Feel free to open issues or contribute improvements!
