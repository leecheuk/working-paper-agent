# Working Paper Agent

**Working Paper Agent** is an AI-powered CLI tool designed for accountants to automate the generation of M-1 working papers from trial balances. It leverages Gemini AI to analyze your data, highlight non-deductible expenses, and compare year-over-year results.

## Features

- Generate M-1 working papers from trial balance CSVs
- Outputs Excel files for easy review

## Requirements

- Node.js (v16+ recommended)
- Gemini API key (exported as `GOOGLE_API_KEY` in your environment)

## Installation

Install globally:

```sh
npm install -g working-paper-agent
```

Or install locally in your project:

```sh
npm install working-paper-agent
```

## Usage

Run the CLI to generate working papers:

```sh
wpa prompt "Generate M-1 adjustments for 2023 based on ./data/2023_tb.csv. Highlight non-deductible expenses and compare with 2022." -f ./data/2023_tb.csv ./data/2022_tb.csv
```

Output files will be saved in the `./output` directory.

## Supported Working Papers

Currently, only M-1 working papers generated from trial balance CSVs are supported.

## Support & Feedback

For questions, feature requests, or bug reports, please open an issue on GitHub or contact the maintainer.

## Supported working papers

We currently only support generating M-1 working papers from a trial balance.
