#!/user/bin/env node

'use strict';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import chalk from 'chalk';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import Papa from 'papaparse';
import fs from 'fs';
import { tool } from "@langchain/core/tools";
import XLSX from 'xlsx';

const error = chalk.bold.red;
const warn = chalk.hex('#FFA500');

const getModel = () => new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    apiKey: process.env.GOOGLE_API_KEY,
});

const getDoc = async ({ file: filePath }) => {
    if (!filePath.endsWith('.csv')) {
        throw new Error(`Unsupported file type: ${filePath}. Only CSV files are supported.`);
    }
    const file = fs.readFileSync(filePath, 'utf8');
    const csv = Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
    });
    if (csv.data.length === 0) {
        throw new Error(`No data found in file: ${filePath}. Please check the file content.`);
    }

    const result = {
        name: filePath,
        content: csv.data
    };
    return result;
}


/**
 * Generate an XLSX file with M-1 adjustments and trial balance data
 * @param {Object[]} adjustments - List of M-1 adjustments
 * @param {Object[]} currentTB - Current year trial balance
 * @param {Object[]} priorTB - Prior year trial balance (optional)
 * @param {string} outputPath - File path to save XLSX
 */
export function generateXlsxWorkingPaper({ adjustments, currentTB, currentYear, lastYear, priorTB = [], outputPath = './output' }) {
    try {
        if (!fs.existsSync('./output')) {
            console.warn(warn(`Output directory './output' does not exist. Creating it...`));
            fs.mkdirSync('./output', { recursive: true });
        }
        const wb = XLSX.utils.book_new();

        console.log(`Generating XLSX working paper for ${currentYear}...`);

        // Sheet 1: Current TB
        const currentSheet = XLSX.utils.json_to_sheet(currentTB);
        XLSX.utils.book_append_sheet(wb, currentSheet, `${currentYear} TB`);

        // Sheet 2: Prior TB
        if (priorTB.length) {
            const priorSheet = XLSX.utils.json_to_sheet(priorTB);
            XLSX.utils.book_append_sheet(wb, priorSheet, `${lastYear} TB`);
        }

        // Sheet 3: Adjustments
        const mappedAdjustments = adjustments.map((adj, index) => ({
            '#': index + 1,
            Account: adj.account,
            Type: adj.type, // 'Permanent' | 'Temporary'
            Amount: adj.amount,
            Explanation: adj.explanation,
            'IRS Ref': adj.irs_rule_ref || '',
            'M-1 Line': adj.m1_line || '',
        }));

        const adjSheet = XLSX.utils.json_to_sheet(mappedAdjustments);
        XLSX.utils.book_append_sheet(wb, adjSheet, 'M-1 Adjustments');

        // Export
        const outputFilePath = outputPath + '/m1_working_paper.xlsx';
        XLSX.writeFile(wb, outputFilePath);

        console.log(`✅ XLSX working paper generated at: ${outputFilePath}`);

        return {
            success: true,
            outputFilePath
        }
    } catch (err) {
        console.error(error(`Error generating XLSX working paper: ${err.message}`));
        return {
            success: false,
            error: err.message
        };
    }
}

const handlePrompt = async (argv) => {
    const task = argv.task;

    if (!process.env.GOOGLE_API_KEY) {
        console.error(error('Error: GOOGLE_API_KEY is not set. Please set it in your environment variables.'));
        process.exit(1);
    }

    console.warn(warn('Warn: This is an alpha version of the working paper agent. It may not work as expected.'));

    const model = getModel();
    const agent = createReactAgent({
        llm: model,
        tools: [
            tool(generateXlsxWorkingPaper, {
                name: 'generate_xlsx_working_paper',
                description: 'Generate an XLSX working paper with M-1 adjustments and trial balance data',
                schema: {
                    type: 'object',
                    properties: {
                        adjustments: {
                            type: 'array',
                            items: {
                                type: 'object',
                                description: 'List of M-1 adjustments in JSON format',
                                properties: {
                                    account: {
                                        type: 'string',
                                        description: 'Account name for the adjustment'
                                    },
                                    type: {
                                        type: 'string',
                                        enum: ['Permanent', 'Temporary'],
                                        description: 'Type of adjustment (Permanent or Temporary)'
                                    },
                                    amount: {
                                        type: 'number',
                                        description: 'Adjustment amount'
                                    },
                                    explanation: {
                                        type: 'string',
                                        description: 'Explanation for the adjustment'
                                    },
                                    irs_rule_ref: {
                                        type: 'string',
                                        description: 'IRS rule reference for the adjustment'
                                    },
                                    m1_line: {
                                        type: 'string',
                                        description: 'M-1 line number for the adjustment'
                                    }
                                }
                            },
                        },
                        currentTB: {
                            type: 'array',
                            items: {
                                type: 'object',
                                description: 'Current year trial balance data in JSON format'
                            },
                        },
                        currentYear: {
                            type: 'string',
                            description: 'Current year for the trial balance'
                        },
                        lastYear: {
                            type: 'string',
                            description: 'Last year for the trial balance'
                        },
                        priorTB: {
                            type: 'array',
                            items: {
                                type: 'object',
                                description: 'Prior year trial balance data in JSON format'
                            }
                        },
                        outputPath: {
                            type: 'string',
                            description: 'File path to save the generated XLSX working paper',
                        }
                    },
                    required: ['adjustments', 'currentTB', 'currentYear', 'lastYear'],
                }
            })
        ],
        verbose: true,
        handleToolError: (error) => {
            console.error('Error during tool execution:', error);
            return `Error: ${error.message}`;
        }
    })

    const systemPrompt =
        new SystemMessage(`
                You are a tax accounting AI assistant helping a CPA prepare M-1 working papers for Form 1120. 

Given a trial balance in CSV format and prior year data, your task is to:
- Identify book-tax differences based on IRS guidelines
- Classify adjustments as temporary or permanent
- Reference appropriate lines for Schedule M-1
- Generate explanations for each adjustment

Use the following authoritative IRS sources:
- [Instructions for Form 1120](https://www.irs.gov/instructions/i1120) (focus on Schedule M-1 section)
- [Publication 542 – Corporations](https://www.irs.gov/publications/p542)
- [Publication 535 – Business Expenses](https://www.irs.gov/publications/p535)

Follow these rules:
- Disallow 50% of meals and entertainment expenses (Pub 535)
- Disallow fines and penalties (Pub 535)
- Exclude tax-exempt interest income (Pub 535)
- Apply book-vs-tax depreciation differences as timing items (Pub 946 if needed)
- Limit charitable contributions to 10% of taxable income before the deduction (Pub 542)

Respond with a table describing and generate the working paper using tool 'generate_xlsx_working_paper':
- Account name
- Adjustment type (permanent/temporary)
- Adjustment amount
- M-1 line number (if applicable)
- IRS rule reference (e.g., IRC §274(n))
- Explanation (based on IRS rule)
`)

    const messages = [
        systemPrompt,
        new HumanMessage(`Task: ${task}`),
    ];

    if (argv.files && argv.files.length > 0) {
        for (const file of argv.files) {
            try {
                const doc = await getDoc({ file });
                messages.push(
                    new HumanMessage(`Trial balance data:\n${JSON.stringify(doc.content, null, 2)}`)
                );
            } catch (err) {
                console.error(error(`Error loading file ${file}: ${err.message}`));
                return;
            }
        }
    }

    const res = await agent.invoke({
        messages
    });

    const lastMessage = res.messages[res.messages.length - 1];
    if (lastMessage.content) {
        console.log('Final agent response:', lastMessage.content);
    }
    if (lastMessage.toolCalls) {
        for (const call of lastMessage.toolCalls) {
            if (call.error) {
                console.error('Final tool call error:', call.error);
            } else {
                console.dir(call.result, { depth: null });
            }
        }
    }
    if (res.error) {
        console.error('Agent error:', res.error);
    }
    if (res.toolErrors) {
        for (const error of res.toolErrors) {
            console.error('Tool error:', error);
        }
    }
    if (res.logs) {
        console.log('Agent logs:', res.logs);
    }
}

yargs()
    .scriptName('wpa')
    .version('0.1.0')
    .usage('$0 <cmd> [args]')
    .command(['prompt <task>', 'p <task>'], 'Ask the agent to perform a task', (yargs) => {
        return yargs
            .positional('task', {
                describe: 'Task for the agent to perform',
                type: 'string'
            })
            .option('files', {
                alias: 'f',
                describe: 'Files to pass to the agent',
                type: 'array'
            });
    }, handlePrompt)
    .help()
    .alias('help', 'h')
    .parse(hideBin(process.argv))
