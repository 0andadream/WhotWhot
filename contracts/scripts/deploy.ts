import { ethers } from "hardhat";

/**
 * Base mainnet Megapot JackpotTicketNFT
 * https://docs.megapot.io/learn/using-smart-contracts
 */
const MEGAPOT_TICKET_NFT = "0x48FfE35AbB9f4780a4f1775C2Ce1c46185b366e4";

async function main() {
  const network = await ethers.provider.getNetwork();
  console.log(`Deploying on chainId=${network.chainId}...`);

  let ticketNft = process.env.TICKET_NFT_ADDRESS || "";

  // Local / unknown chains: deploy MockTicketNFT
  if (!ticketNft || network.chainId === 31337n) {
    const Mock = await ethers.getContractFactory("MockTicketNFT");
    const mock = await Mock.deploy();
    await mock.waitForDeployment();
    ticketNft = await mock.getAddress();
    console.log(`MockTicketNFT: ${ticketNft}`);
  } else if (network.chainId === 8453n) {
    ticketNft = MEGAPOT_TICKET_NFT;
    console.log(`Using Megapot JackpotTicketNFT: ${ticketNft}`);
  }

  const Escrow = await ethers.getContractFactory("WhotMatchEscrow");
  const escrow = await Escrow.deploy(ticketNft);
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();

  console.log(`WhotMatchEscrow: ${escrowAddr}`);
  console.log(`\nSet NEXT_PUBLIC_WHOT_ESCROW_ADDRESS=${escrowAddr}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
