import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Base mainnet Megapot JackpotTicketNFT
 * https://docs.megapot.io/learn/using-smart-contracts
 */
const MEGAPOT_TICKET_NFT = "0x48FfE35AbB9f4780a4f1775C2Ce1c46185b366e4";

async function main() {
  const network = await ethers.provider.getNetwork();
  const [deployer] = await ethers.getSigners();
  console.log(`Network chainId=${network.chainId}`);
  console.log(`Deployer: ${deployer.address}`);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(bal)} ETH`);

  let ticketNft = (process.env.TICKET_NFT_ADDRESS || "").trim();

  if (network.chainId === 8453n) {
    // Base mainnet: always use official Megapot tickets unless explicitly overridden
    ticketNft = ticketNft || MEGAPOT_TICKET_NFT;
    console.log(`Using Megapot JackpotTicketNFT: ${ticketNft}`);
  } else if (!ticketNft || network.chainId === 31337n) {
    // Local / unspecified: deploy mock tickets for tests & demos
    const Mock = await ethers.getContractFactory("MockTicketNFT");
    const mock = await Mock.deploy();
    await mock.waitForDeployment();
    ticketNft = await mock.getAddress();
    console.log(`MockTicketNFT: ${ticketNft}`);
  }

  const Escrow = await ethers.getContractFactory("WhotMatchEscrow");
  const escrow = await Escrow.deploy(ticketNft);
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();

  console.log(`\n✅ WhotMatchEscrow: ${escrowAddr}`);
  console.log(`   ticketNFT:       ${ticketNft}`);

  // Write env snippets for local + Vercel
  const root = path.resolve(__dirname, "../..");
  const envLine = `NEXT_PUBLIC_WHOT_ESCROW_ADDRESS=${escrowAddr}\n`;
  const envLocalPath = path.join(root, "frontend", ".env.local");
  const envRootPath = path.join(root, ".env.local");

  // Merge into frontend/.env.local
  let existing = "";
  if (fs.existsSync(envLocalPath)) {
    existing = fs.readFileSync(envLocalPath, "utf8");
    existing = existing
      .split("\n")
      .filter((l) => !l.startsWith("NEXT_PUBLIC_WHOT_ESCROW_ADDRESS="))
      .join("\n")
      .trim();
  }
  const nextEnv = [existing, envLine.trim(), `NEXT_PUBLIC_CHAIN_ID=${network.chainId}`]
    .filter(Boolean)
    .join("\n") + "\n";
  fs.writeFileSync(envLocalPath, nextEnv);
  console.log(`\nWrote ${envLocalPath}`);

  // Also append to root .env if present
  const rootEnv = path.join(root, ".env");
  if (fs.existsSync(rootEnv)) {
    let re = fs.readFileSync(rootEnv, "utf8");
    if (re.includes("NEXT_PUBLIC_WHOT_ESCROW_ADDRESS=")) {
      re = re.replace(
        /NEXT_PUBLIC_WHOT_ESCROW_ADDRESS=.*/g,
        `NEXT_PUBLIC_WHOT_ESCROW_ADDRESS=${escrowAddr}`
      );
    } else {
      re = re.trimEnd() + `\nNEXT_PUBLIC_WHOT_ESCROW_ADDRESS=${escrowAddr}\n`;
    }
    fs.writeFileSync(rootEnv, re);
  }

  // Artifact for CI / Vercel manual paste
  const outDir = path.join(root, "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const artifact = {
    network: network.name,
    chainId: Number(network.chainId),
    escrow: escrowAddr,
    ticketNft,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(outDir, `whot-escrow-${network.chainId}.json`),
    JSON.stringify(artifact, null, 2)
  );
  console.log(`Saved deployments/whot-escrow-${network.chainId}.json`);
  console.log(`\n→ Vercel: set env NEXT_PUBLIC_WHOT_ESCROW_ADDRESS=${escrowAddr}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
