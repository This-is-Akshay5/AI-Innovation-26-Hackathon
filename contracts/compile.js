const solc = require("solc");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "MedicalMemoryRegistry.sol"), "utf8");
const input = {
  language: "Solidity",
  sources: { "MedicalMemoryRegistry.sol": { content: source } },
  settings: {
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    optimizer: { enabled: true, runs: 200 },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  let hasFatal = false;
  for (const e of output.errors) {
    console.log(`${e.severity.toUpperCase()}: ${e.formattedMessage}`);
    if (e.severity === "error") hasFatal = true;
  }
  if (hasFatal) process.exit(1);
}

const contract = output.contracts["MedicalMemoryRegistry.sol"]["MedicalMemoryRegistry"];
fs.mkdirSync(path.join(__dirname, "artifacts"), { recursive: true });
fs.writeFileSync(
  path.join(__dirname, "artifacts", "MedicalMemoryRegistry.json"),
  JSON.stringify({ abi: contract.abi, bytecode: "0x" + contract.evm.bytecode.object }, null, 2)
);
fs.writeFileSync(
  path.join(__dirname, "abi", "MedicalMemoryRegistry.json"),
  JSON.stringify(contract.abi, null, 2) + "\n"
);

console.log("Compiled OK. Artifact: contracts/artifacts/MedicalMemoryRegistry.json");
