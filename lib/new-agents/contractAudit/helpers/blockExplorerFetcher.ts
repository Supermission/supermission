import { type NextRequest } from 'next/server';

// Etherscan V2 unified endpoint — one API key for all chains
const ETHERSCAN_V2_BASE = 'https://api.etherscan.io/v2/api';
const SUPPORTED_CHAINS = new Set([1, 8453, 42161]);

export async function fetchContractSource(address: string, chainId: number): Promise<{
    sourceCode: string;
    contractName: string;
    compilerVersion: string;
    isVerified: boolean;
}> {
    if (!SUPPORTED_CHAINS.has(chainId)) {
        throw new Error(`Unsupported chain ID: ${chainId}. Supported: Ethereum (1), Base (8453), Arbitrum (42161)`);
    }

    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
        throw new Error('Missing ETHERSCAN_API_KEY — required for contract source fetching');
    }

    const url = `${ETHERSCAN_V2_BASE}?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === '0' || !data.result || data.result.length === 0) {
            throw new Error(data.result || 'Contract source not found or not verified');
        }

        const result = data.result[0];

        // EOA check: if ABI is empty/default and no source code, it's likely an EOA not a contract
        if (!result.SourceCode && (!result.ABI || result.ABI === 'Contract source code not verified')) {
            throw new Error('This address appears to be an EOA (Externally Owned Account), not a smart contract. Please provide a valid contract address.');
        }

        if (!result.SourceCode) {
            throw new Error('No verified source code found for this contract. The contract may not be verified on the block explorer.');
        }

        // Handle potential multiple files (JSON format)
        let finalSource = result.SourceCode;
        if (finalSource.startsWith('{{')) {
            // It's a double braced JSON, usually standard json input
            finalSource = finalSource.slice(1, -1); // Remove outer braces
        }

        // Sometimes it is just a single file string, sometimes json object
        // For simplicity in this agent, if it's JSON, we might concatenate or just take the main part.
        // But the audit agent expects a single string usually. 
        // If it's a multi-file contract, the SourceCode field might be a JSON string.

        try {
            const parsed = JSON.parse(finalSource);
            const contractNameLower = (result.ContractName || '').toLowerCase();

            if (parsed.sources) {
                // Standard JSON input — prioritize the main contract file, then include
                // direct dependencies. Skip deep transitive deps to keep size manageable.
                const entries = Object.entries(parsed.sources) as [string, any][];

                // Find the main contract file by matching ContractName in the path
                const mainEntry = entries.find(([path]) => {
                    const fileName = path.split('/').pop()?.replace('.sol', '').toLowerCase() || '';
                    return fileName === contractNameLower;
                });

                if (mainEntry) {
                    // Put main contract first, then remaining files (skip deep node_modules deps)
                    const otherEntries = entries.filter(([path]) =>
                        path !== mainEntry[0] && !path.includes('node_modules/')
                    );
                    finalSource = `// File: ${mainEntry[0]} (MAIN CONTRACT)\n\n${mainEntry[1].content}`
                        + (otherEntries.length > 0
                            ? '\n\n' + otherEntries
                                .map(([path, content]) => `// File: ${path}\n\n${content.content}`)
                                .join('\n\n')
                            : '');
                } else {
                    finalSource = entries
                        .filter(([path]) => !path.includes('node_modules/'))
                        .map(([path, content]) => `// File: ${path}\n\n${content.content}`)
                        .join('\n\n');
                }
            } else if (typeof parsed === 'object') {
                const entries = Object.entries(parsed) as [string, any][];
                const mainEntry = entries.find(([path]) => {
                    const fileName = path.split('/').pop()?.replace('.sol', '').toLowerCase() || '';
                    return fileName === contractNameLower;
                });

                if (mainEntry) {
                    const otherEntries = entries.filter(([path]) =>
                        path !== mainEntry[0] && !path.includes('node_modules/')
                    );
                    finalSource = `// File: ${mainEntry[0]} (MAIN CONTRACT)\n\n${mainEntry[1].content}`
                        + (otherEntries.length > 0
                            ? '\n\n' + otherEntries
                                .map(([path, content]) => `// File: ${path}\n\n${content.content}`)
                                .join('\n\n')
                            : '');
                } else {
                    finalSource = entries
                        .filter(([path]) => !path.includes('node_modules/'))
                        .map(([path, content]) => `// File: ${path}\n\n${content.content}`)
                        .join('\n\n');
                }
            }
        } catch (e) {
            // Not a JSON string, so it's a flat file
            // proceed as is
        }

        return {
            sourceCode: finalSource,
            contractName: result.ContractName,
            compilerVersion: result.CompilerVersion,
            isVerified: true
        };

    } catch (error: any) {
        throw new Error(`Failed to fetch contract: ${error.message}`);
    }
}
