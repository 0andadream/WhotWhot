import { expect } from "chai";
import { ethers } from "hardhat";
import { MockTicketNFT, WhotMatchEscrow } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("WhotMatchEscrow", function () {
  let nft: MockTicketNFT;
  let escrow: WhotMatchEscrow;
  let p1: HardhatEthersSigner;
  let p2: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  beforeEach(async () => {
    [p1, p2, other] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory("MockTicketNFT");
    nft = await NFT.deploy();
    await nft.waitForDeployment();

    const Escrow = await ethers.getContractFactory("WhotMatchEscrow");
    escrow = await Escrow.deploy(await nft.getAddress());
    await escrow.waitForDeployment();

    // Mint tickets: p1 gets 1,2  p2 gets 3,4
    await nft.mint(p1.address);
    await nft.mint(p1.address);
    await nft.mint(p2.address);
    await nft.mint(p2.address);

    await nft.connect(p1).setApprovalForAll(await escrow.getAddress(), true);
    await nft.connect(p2).setApprovalForAll(await escrow.getAddress(), true);
  });

  it("creates a match and locks ticket", async () => {
    await expect(escrow.connect(p1).createMatch(1)).to.emit(escrow, "MatchCreated");

    expect(await nft.ownerOf(1)).to.equal(await escrow.getAddress());
    const m = await escrow.getMatch(1);
    expect(m.player1).to.equal(p1.address);
    expect(m.ticket1).to.equal(1n);
    expect(m.status).to.equal(1); // Waiting
  });

  it("join + dual submitResult transfers both tickets to winner", async () => {
    await escrow.connect(p1).createMatch(1);
    await expect(escrow.connect(p2).joinMatch(1, 3))
      .to.emit(escrow, "MatchJoined");

    const m = await escrow.getMatch(1);
    expect(m.status).to.equal(2); // Active
    expect(m.gameSeed).to.not.equal(ethers.ZeroHash);

    await escrow.connect(p1).submitResult(1, p2.address);
    await expect(escrow.connect(p2).submitResult(1, p2.address))
      .to.emit(escrow, "MatchResolved")
      .withArgs(1n, p2.address, 1n, 3n);

    expect(await nft.ownerOf(1)).to.equal(p2.address);
    expect(await nft.ownerOf(3)).to.equal(p2.address);
  });

  it("disagreement does not resolve", async () => {
    await escrow.connect(p1).createMatch(1);
    await escrow.connect(p2).joinMatch(1, 3);
    await escrow.connect(p1).submitResult(1, p1.address);
    await escrow.connect(p2).submitResult(1, p2.address);

    const m = await escrow.getMatch(1);
    expect(m.status).to.equal(2); // still Active
    expect(await nft.ownerOf(1)).to.equal(await escrow.getAddress());
  });

  it("cancel waiting returns ticket", async () => {
    await escrow.connect(p1).createMatch(1);
    await escrow.connect(p1).cancelWaiting(1);
    expect(await nft.ownerOf(1)).to.equal(p1.address);
  });

  it("timeout cancel returns both tickets", async () => {
    await escrow.connect(p1).createMatch(1);
    await escrow.connect(p2).joinMatch(1, 3);

    await ethers.provider.send("evm_increaseTime", [2 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);

    await escrow.connect(p1).cancelActive(1);
    expect(await nft.ownerOf(1)).to.equal(p1.address);
    expect(await nft.ownerOf(3)).to.equal(p2.address);
  });

  it("cannot join your own match", async () => {
    await escrow.connect(p1).createMatch(1);
    await expect(escrow.connect(p1).joinMatch(1, 2)).to.be.revertedWithCustomError(
      escrow,
      "CannotPlayYourself"
    );
  });
});
