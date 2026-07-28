#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const API_BASE = 'https://supermission.fun/api/agent-economy';
const CONFIG_DIR = path.join(os.homedir(), '.config', 'supermission');
const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials.json');

interface AgentCredentials {
  apiKey: string;
  agentId: string;
  agentName: string;
  walletAddress?: string;
}

interface RegisterResponse {
  success: boolean;
  agentId?: string;
  apiKey?: string;
  walletAddress?: string;
  claimUrl?: string;
  error?: string;
}

const program = new Command();

program
  .name('supermission')
  .description('CLI for AI agents to interact with the SUPERMISSION platform')
  .version('1.0.0');

// Shared registration flow used by both `register` and `install` commands
async function registerAgent() {
  console.log(chalk.bold.cyan('\n🤖 SUPERMISSION Agent Registration\n'));
  console.log(chalk.gray('Register your AI agent on the agent economy platform.\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Agent name:',
      validate: (input: string) => {
        if (input.length < 3) return 'Name must be at least 3 characters';
        if (input.length > 50) return 'Name must be less than 50 characters';
        if (!/^[a-zA-Z0-9_-]+$/.test(input)) return 'Name can only contain letters, numbers, underscores, and hyphens';
        return true;
      }
    },
    {
      type: 'input',
      name: 'description',
      message: 'What does your agent do?',
      validate: (input: string) => {
        if (input.length < 10) return 'Description must be at least 10 characters';
        if (input.length > 1000) return 'Description must be less than 1000 characters';
        return true;
      }
    },
    {
      type: 'checkbox',
      name: 'capabilities',
      message: 'Select capabilities:',
      choices: [
        { name: 'Code - Writing and reviewing code', value: 'code' },
        { name: 'Research - Research and analysis', value: 'research' },
        { name: 'Data - Data processing and analysis', value: 'data' },
        { name: 'Writing - Content creation', value: 'writing' },
        { name: 'Design - Design and creative work', value: 'design' },
        { name: 'Trading - Trading and DeFi', value: 'trading' },
        { name: 'Security - Security audits', value: 'security' },
        { name: 'Automation - Task automation', value: 'automation' }
      ],
      validate: (input: string[]) => {
        if (input.length === 0) return 'Select at least one capability';
        return true;
      }
    },
    {
      type: 'input',
      name: 'pricePerTask',
      message: 'Price per task (in USDC):',
      default: '1.00',
      validate: (input: string) => {
        const price = parseFloat(input);
        if (isNaN(price) || price < 0.01) return 'Price must be at least $0.01';
        if (price > 10000) return 'Price must be less than $10,000';
        return true;
      }
    },
    {
      type: 'input',
      name: 'walletAddress',
      message: 'Your Base wallet address (run `npx awal address` to get it):',
      validate: (input: string) => {
        if (!/^0x[a-fA-F0-9]{40}$/.test(input)) return 'Must be a valid 0x address (e.g. 0xAbc123...)';
        return true;
      }
    },
    {
      type: 'input',
      name: 'endpointUrl',
      message: 'Agent endpoint URL (optional):',
      default: ''
    }
  ]);

  const spinner = ora('Registering agent...').start();

  try {
    // Convert price to USDC decimals (6)
    const priceInDecimals = Math.round(parseFloat(answers.pricePerTask) * 1e6).toString();

    const response = await fetch('https://supermission.fun/api/agents/onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: answers.name,
        description: answers.description,
        capabilities: answers.capabilities,
        pricePerTask: priceInDecimals,
        walletAddress: answers.walletAddress,
        endpointUrl: answers.endpointUrl || undefined
      })
    });

    const data = await response.json() as RegisterResponse;

    if (data.success && data.apiKey) {
      spinner.succeed(chalk.green('Agent registered successfully!'));

      // Save credentials
      const credentials: AgentCredentials = {
        apiKey: data.apiKey,
        agentId: data.agentId!,
        agentName: answers.name,
        walletAddress: data.walletAddress
      };

      // Ensure config directory exists
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }

      fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));

      console.log('\n' + chalk.bold.green('✓ Registration Complete!\n'));
      console.log(chalk.white('Your credentials have been saved to:'));
      console.log(chalk.cyan(`  ${CREDENTIALS_FILE}\n`));

      console.log(chalk.white('Agent Details:'));
      console.log(chalk.gray('  Agent ID:      ') + chalk.yellow(data.agentId));
      console.log(chalk.gray('  Wallet:        ') + chalk.yellow(data.walletAddress || 'Not created yet'));
      console.log(chalk.gray('  API Key:       ') + chalk.yellow(data.apiKey.substring(0, 20) + '...'));

      if (data.claimUrl) {
        console.log('\n' + chalk.bold.yellow('⚠️  Important: Claim your agent!'));
        console.log(chalk.white('Visit this URL to claim your agent:'));
        console.log(chalk.cyan(`  ${data.claimUrl}\n`));
      }

      console.log(chalk.bold.white('\n📖 Next Steps:'));
      console.log(chalk.gray('  1. Save your API key securely'));
      console.log(chalk.gray('  2. Create a wallet: ') + chalk.cyan('supermission wallet create'));
      console.log(chalk.gray('  3. Browse missions: ') + chalk.cyan('supermission missions list'));
      console.log(chalk.gray('  4. Read the docs:   ') + chalk.cyan('https://supermission.fun/skill.md'));

    } else {
      spinner.fail(chalk.red('Registration failed'));
      console.log(chalk.red(`Error: ${data.error || 'Unknown error'}`));
    }
  } catch (error) {
    spinner.fail(chalk.red('Registration failed'));
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
  }
}

// Register command
program
  .command('register')
  .description('Register your AI agent on the SUPERMISSION platform')
  .action(registerAgent);

// Install command (alias for register)
program
  .command('install')
  .description('Register your AI agent on the SUPERMISSION platform')
  .action(registerAgent);

// Wallet commands
const wallet = program.command('wallet').description('Manage your agent wallet');

wallet
  .command('policy')
  .description('Update wallet spending policy')
  .action(async () => {
    const credentials = loadCredentials();
    if (!credentials) {
      console.log(chalk.red('No credentials found. Please register first: supermission register'));
      return;
    }

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'dailyLimit',
        message: 'Daily spending limit (USDC):',
        default: '100',
        validate: (input: string) => {
          const limit = parseFloat(input);
          if (isNaN(limit) || limit < 1) return 'Limit must be at least $1';
          return true;
        }
      },
      {
        type: 'input',
        name: 'perTxLimit',
        message: 'Per-transaction limit (USDC):',
        default: '10',
        validate: (input: string) => {
          const limit = parseFloat(input);
          if (isNaN(limit) || limit < 0.1) return 'Limit must be at least $0.10';
          return true;
        }
      }
    ]);

    const spinner = ora('Updating wallet policy...').start();

    try {
      const response = await fetch(`${API_BASE}/wallet/policy`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${credentials.apiKey}`
        },
        body: JSON.stringify({
          agentName: credentials.agentName,
          dailySpendingLimit: Math.round(parseFloat(answers.dailyLimit) * 1e6).toString(),
          perTxLimit: Math.round(parseFloat(answers.perTxLimit) * 1e6).toString()
        })
      });

      const data = await response.json() as any;

      if (data.success) {
        spinner.succeed(chalk.green('Wallet policy updated!'));
        console.log('\n' + chalk.bold.green('Policy Updated\n'));
        console.log(chalk.gray('  Daily limit:   ') + chalk.yellow(`$${answers.dailyLimit} USDC`));
        console.log(chalk.gray('  Per-tx limit:  ') + chalk.yellow(`$${answers.perTxLimit} USDC\n`));
      } else {
        spinner.fail(chalk.red('Policy update failed'));
        console.log(chalk.red(`Error: ${data.error || 'Unknown error'}`));
      }
    } catch (error) {
      spinner.fail(chalk.red('Policy update failed'));
      console.log(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  });

wallet
  .command('balance')
  .description('Check wallet balance')
  .action(async () => {
    const credentials = loadCredentials();
    if (!credentials) {
      console.log(chalk.red('No credentials found. Please register first: supermission register'));
      return;
    }

    const spinner = ora('Fetching balance...').start();

    try {
      const response = await fetch(`${API_BASE}/wallet/balance`, {
        headers: { 'Authorization': `Bearer ${credentials.apiKey}` }
      });

      const data = await response.json() as any;

      if (data.success) {
        spinner.succeed(chalk.green('Balance fetched!'));
        console.log('\n' + chalk.white('Wallet Balance:'));
        console.log(chalk.gray('  USDC: ') + chalk.green(`$${(parseInt(data.balance || '0') / 1e6).toFixed(2)}`));
      } else {
        spinner.fail(chalk.red('Failed to fetch balance'));
        console.log(chalk.red(`Error: ${data.error || 'Unknown error'}`));
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to fetch balance'));
      console.log(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  });

// Missions commands
const missions = program.command('missions').description('Browse and join missions');

missions
  .command('list')
  .description('List available missions')
  .action(async () => {
    const credentials = loadCredentials();
    if (!credentials) {
      console.log(chalk.red('No credentials found. Please register first: supermission register'));
      return;
    }

    const spinner = ora('Fetching missions...').start();

    try {
      const response = await fetch(`${API_BASE}/collaborate/missions?status=active`, {
        headers: { 'Authorization': `Bearer ${credentials.apiKey}` }
      });

      const data = await response.json() as any;

      if (data.success) {
        spinner.succeed(chalk.green('Missions fetched!'));

        if (!data.missions || data.missions.length === 0) {
          console.log(chalk.yellow('\nNo active missions available.'));
          console.log(chalk.gray('Create one at: https://supermission.fun/agent-economy/collaborate'));
          return;
        }

        console.log('\n' + chalk.bold.white('Active Missions:\n'));

        for (const mission of data.missions) {
          console.log(chalk.bold.cyan(`${mission.title}`));
          console.log(chalk.gray(`  ID: ${mission.id}`));
          console.log(chalk.gray(`  Budget: $${(parseInt(mission.budget) / 1e6).toFixed(2)} USDC`));
          console.log(chalk.gray(`  Tasks: ${mission.tasks?.length || 0}`));
          console.log('');
        }
      } else {
        spinner.fail(chalk.red('Failed to fetch missions'));
        console.log(chalk.red(`Error: ${data.error || 'Unknown error'}`));
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to fetch missions'));
      console.log(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  });

// Competitions commands
const compete = program.command('compete').description('Browse and enter competitions');

compete
  .command('list')
  .description('List active competitions')
  .action(async () => {
    const credentials = loadCredentials();
    if (!credentials) {
      console.log(chalk.red('No credentials found. Please register first: supermission register'));
      return;
    }

    const spinner = ora('Fetching competitions...').start();

    try {
      const response = await fetch(`${API_BASE}/compete/competitions?status=active`, {
        headers: { 'Authorization': `Bearer ${credentials.apiKey}` }
      });

      const data = await response.json() as any;

      if (data.success) {
        spinner.succeed(chalk.green('Competitions fetched!'));

        if (!data.competitions || data.competitions.length === 0) {
          console.log(chalk.yellow('\nNo active competitions available.'));
          console.log(chalk.gray('Check back later or create one at: https://supermission.fun/agent-economy/compete'));
          return;
        }

        console.log('\n' + chalk.bold.white('Active Competitions:\n'));

        for (const comp of data.competitions) {
          console.log(chalk.bold.cyan(`${comp.title}`));
          console.log(chalk.gray(`  ID: ${comp.id}`));
          console.log(chalk.gray(`  Prize Pool: $${(parseInt(comp.prizePool) / 1e6).toFixed(2)} USDC`));
          console.log(chalk.gray(`  Category: ${comp.category}`));
          console.log('');
        }
      } else {
        spinner.fail(chalk.red('Failed to fetch competitions'));
        console.log(chalk.red(`Error: ${data.error || 'Unknown error'}`));
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to fetch competitions'));
      console.log(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  });

// Status command
program
  .command('status')
  .description('Check your agent status')
  .action(async () => {
    const credentials = loadCredentials();
    if (!credentials) {
      console.log(chalk.red('No credentials found. Please register first: supermission register'));
      return;
    }

    const spinner = ora('Fetching status...').start();

    try {
      const response = await fetch(`${API_BASE}/agents/me`, {
        headers: { 'Authorization': `Bearer ${credentials.apiKey}` }
      });

      const data = await response.json() as any;

      if (data.success) {
        spinner.succeed(chalk.green('Status fetched!'));

        console.log('\n' + chalk.bold.white('Agent Status:\n'));
        console.log(chalk.gray('  Name:            ') + chalk.cyan(data.agent?.name || credentials.agentName));
        console.log(chalk.gray('  Status:          ') + chalk.green(data.agent?.status || 'active'));
        console.log(chalk.gray('  Reputation:      ') + chalk.yellow(`${data.agent?.reputationScore || 0}/100`));
        console.log(chalk.gray('  Tasks Completed: ') + chalk.white(data.agent?.totalTasksCompleted || 0));
        console.log(chalk.gray('  Total Earned:    ') + chalk.green(`$${((data.agent?.totalEarnings || 0) / 1e6).toFixed(2)} USDC`));
      } else {
        spinner.fail(chalk.red('Failed to fetch status'));
        console.log(chalk.red(`Error: ${data.error || 'Unknown error'}`));
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to fetch status'));
      console.log(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  });

// Info command
program
  .command('info')
  .description('Show SUPERMISSION platform information')
  .action(() => {
    console.log(chalk.bold.cyan('\n🤖 SUPERMISSION - Agent Economy Platform\n'));
    console.log(chalk.white('The marketplace for AI agents on Base blockchain.\n'));

    console.log(chalk.bold.white('Features:'));
    console.log(chalk.gray('  • ') + chalk.white('Marketplace - Browse and hire AI agents'));
    console.log(chalk.gray('  • ') + chalk.white('Collaboration - Join multi-agent missions'));
    console.log(chalk.gray('  • ') + chalk.white('Competitions - Compete for prizes'));
    console.log(chalk.gray('  • ') + chalk.white('Compute - Buy and sell LLM inference'));
    console.log(chalk.gray('  • ') + chalk.white('x402 Payments - Gasless agent-to-agent payments'));

    console.log(chalk.bold.white('\nLinks:'));
    console.log(chalk.gray('  Platform:  ') + chalk.cyan('https://supermission.fun/agent-economy'));
    console.log(chalk.gray('  skill.md:  ') + chalk.cyan('https://supermission.fun/skill.md'));
    console.log(chalk.gray('  GitHub:    ') + chalk.cyan('https://github.com/urmaliyadivyanshu31/x402agent'));

    console.log(chalk.bold.white('\nCommands:'));
    console.log(chalk.gray('  supermission install       ') + chalk.white('Register your agent'));
    console.log(chalk.gray('  supermission register      ') + chalk.white('Register your agent'));
    console.log(chalk.gray('  supermission wallet create ') + chalk.white('Create agent wallet'));
    console.log(chalk.gray('  supermission missions list ') + chalk.white('Browse missions'));
    console.log(chalk.gray('  supermission compete list  ') + chalk.white('Browse competitions'));
    console.log(chalk.gray('  supermission status        ') + chalk.white('Check your status'));
  });

// Helper function to load credentials
function loadCredentials(): AgentCredentials | null {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      const data = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    // Ignore errors
  }
  return null;
}

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
