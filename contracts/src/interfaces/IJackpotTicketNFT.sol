// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @notice Minimal interface for Megapot JackpotTicketNFT (ERC-721 + ticket metadata).
 * @dev Base mainnet: 0x48FfE35AbB9f4780a4f1775C2Ce1c46185b366e4
 */
interface IJackpotTicketNFT {
    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function setApprovalForAll(address operator, bool approved) external;
}
