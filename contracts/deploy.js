/**
 * Deploys MedicalMemoryRegistry to the network configured via env vars.
 *
 * Usage:
 *   SEPOLIA_RPC_URL=... BLOCKCHAIN_SIGNER_PRIVATE_KEY=... node contracts/deploy.js
 *
 * On success, prints the deployed contract address — put that value in
 * MEDICAL_MEMORY_CONTRACT_ADDRESS in your .env.local.
 *
 * This is a real deployment against whatever RPC endpoint you provide
 * (Sepolia is recommended for the hackathon demo). It requires a funded
 * Sepolia account — get test ETH from a public faucet first.
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { ContractFactory, JsonRpcProvider, Wallet } = require("ethers");

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const pk = process.env.BLOCKCHAIN_SIGNER_PRIVATE_KEY;

  if (!rpcUrl || !pk) {
    console.error(
      "Missing SEPOLIA_RPC_URL or BLOCKCHAIN_SIGNER_PRIVATE_KEY. Set them in .env.local before deploying."
    );
    process.exit(1);
  }

  const artifactPath = path.join(__dirname, "artifacts", "MedicalMemoryRegistry.json");
  if (!fs.existsSync(artifactPath)) {
    console.error(
      "No compiled artifact found. Run `npm run contracts:compile` first."
    );
    process.exit(1);
  }
  const { abi, bytecode } = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(pk, provider);

  console.log(`Deploying from ${wallet.address} ...`);
  const factory = new ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("\nDeployed MedicalMemoryRegistry to:", address);
  console.log("Set MEDICAL_MEMORY_CONTRACT_ADDRESS=" + address + " in .env.local\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
