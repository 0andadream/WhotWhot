// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title MockTicketNFT
 * @notice Local / testnet stand-in for Megapot JackpotTicketNFT.
 *         Mint free tickets for Hardhat tests and demos.
 */
contract MockTicketNFT is ERC721 {
    uint256 private _nextId = 1;

    constructor() ERC721("Mock Megapot Ticket", "mJACKPOT") {}

    function mint(address to) external returns (uint256 tokenId) {
        tokenId = _nextId++;
        _safeMint(to, tokenId);
    }

    function mintBatch(address to, uint256 count) external returns (uint256[] memory ids) {
        ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = _nextId++;
            _safeMint(to, ids[i]);
        }
    }
}
