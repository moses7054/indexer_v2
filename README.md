# Solana Program Account Indexer

This project fetches and deserializes Solana program accounts, then exports the data to a CSV file. It is designed to work with a specific program on the Solana Devnet.
Generated using llm.

## Features

- Fetches all accounts for a given program ID
- Deserializes account data using Borsh
- Exports the results to a timestamped CSV file in the `output` directory

## Prerequisites

- Node.js (v16 or later recommended)
- Yarn package manager

## Installation

1. Install dependencies:
   ```bash
   yarn install
   ```

## Setup

1. Open `index.ts` and replace the placeholder with your program ID:
   ```typescript
   const PROGRAM_ID = "Enter Program ID here";
   ```
   Change it to:
   ```typescript
   const PROGRAM_ID = "your_actual_program_id_here";
   ```

## Usage

To run the indexer and export the accounts to CSV, simply use:

```bash
yarn index
```

The output CSV file will be saved in the `output` directory with a timestamped filename.

## Output

- The CSV file will contain all deserialized account data for the specified program.
- The filename will be in the format: `application_accounts_<timestamp>.csv`

## Customization

- You can change the program ID or filters by editing the relevant lines in `index.ts`.

---

Feel free to open issues or contribute improvements!
