// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title WhotMatchEscrow
 * @notice Escrow for 2-player Whot matches staked with Megapot ticket NFTs.
 *
 *  Flow (jam MVP):
 *  1. Player A calls createMatch(ticketId)  → ticket locked, match Waiting
 *  2. Player B calls joinMatch(matchId, ticketId) → both tickets locked, Active
 *  3. Players play Whot off-chain (seed from on-chain gameSeed for fair shuffle)
 *  4. Both players call submitResult(matchId, winner)
 *     When both agree on the same winner → both ticket NFTs transfer to winner
 *
 *  Cancel / timeout:
 *  - Creator can cancel while Waiting (ticket returned)
 *  - Either player can cancel after RESULT_TIMEOUT if results disagree or none submitted
 *    → both tickets returned to original stakers
 *
 *  Simplification for the jam:
 *  - Gameplay is off-chain (or client-synced via events); only stake + resolve is on-chain.
 *  - Dual-confirmation prevents a single player from stealing tickets.
 *  - No Inco confidential compute in v1 (can wrap later).
 */
contract WhotMatchEscrow is IERC721Receiver, ReentrancyGuard {
    // ─────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────

    enum MatchStatus {
        None,
        Waiting, // creator staked, awaiting opponent
        Active, // both staked, game in progress
        Resolved, // tickets transferred to winner
        Cancelled // tickets returned
    }

    struct Match {
        address player1;
        address player2;
        uint256 ticket1; // Megapot ticket NFT id staked by player1
        uint256 ticket2; // Megapot ticket NFT id staked by player2
        MatchStatus status;
        address player1Result; // winner address submitted by player1 (address(0) if none)
        address player2Result; // winner address submitted by player2
        uint64 createdAt;
        uint64 startedAt;
        bytes32 gameSeed; // deterministic seed for client-side deck shuffle
    }

    // ─────────────────────────────────────────────────────────────────────
    // Constants / immutables
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Megapot JackpotTicketNFT on Base (or MockTicketNFT in tests)
    IERC721 public immutable ticketNFT;

    /// @notice How long after start before either player may force-cancel (return tickets)
    uint64 public constant RESULT_TIMEOUT = 2 hours;

    /// @notice How long a Waiting match may sit before creator (or anyone) can cancel
    uint64 public constant WAITING_TIMEOUT = 24 hours;

    // ─────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────

    uint256 public nextMatchId = 1;
    mapping(uint256 => Match) public matches;

    /// @notice Open match ids waiting for an opponent (for simple lobby listing)
    uint256[] private _openMatchIds;
    mapping(uint256 => uint256) private _openMatchIndex; // matchId => index+1 in _openMatchIds

    // ─────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────

    event MatchCreated(
        uint256 indexed matchId,
        address indexed player1,
        uint256 ticketId,
        uint64 createdAt
    );

    event MatchJoined(
        uint256 indexed matchId,
        address indexed player2,
        uint256 ticketId,
        bytes32 gameSeed,
        uint64 startedAt
    );

    event ResultSubmitted(
        uint256 indexed matchId,
        address indexed submitter,
        address indexed winner
    );

    event MatchResolved(
        uint256 indexed matchId,
        address indexed winner,
        uint256 ticket1,
        uint256 ticket2
    );

    event MatchCancelled(uint256 indexed matchId, string reason);

    event ChallengeCreated(
        uint256 indexed matchId,
        address indexed challenger,
        address indexed challenged,
        uint256 ticketId
    );

    /// @notice Optional: clients can post opaque move blobs for multiplayer sync without a server
    event MovePosted(
        uint256 indexed matchId,
        address indexed player,
        uint256 moveIndex,
        bytes payload
    );

    // ─────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────

    error InvalidTicket();
    error NotTicketOwner();
    error NotPlayer();
    error BadStatus();
    error CannotPlayYourself();
    error InvalidWinner();
    error TimeoutNotReached();
    error AlreadySubmitted();
    error ZeroAddress();

    // ─────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @param _ticketNFT Megapot JackpotTicketNFT address on Base:
     *        0x48FfE35AbB9f4780a4f1775C2Ce1c46185b366e4
     */
    constructor(address _ticketNFT) {
        if (_ticketNFT == address(0)) revert ZeroAddress();
        ticketNFT = IERC721(_ticketNFT);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Match lifecycle
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Create a match and stake one Megapot ticket NFT.
     * @dev Caller must `approve` this contract (or setApprovalForAll) for `ticketId`.
     * @param ticketId Token id of the JackpotTicketNFT to lock.
     * @return matchId New match identifier (share this with opponent).
     */
    function createMatch(uint256 ticketId) external nonReentrant returns (uint256 matchId) {
        _pullTicket(msg.sender, ticketId);

        matchId = nextMatchId++;
        matches[matchId] = Match({
            player1: msg.sender,
            player2: address(0),
            ticket1: ticketId,
            ticket2: 0,
            status: MatchStatus.Waiting,
            player1Result: address(0),
            player2Result: address(0),
            createdAt: uint64(block.timestamp),
            startedAt: 0,
            gameSeed: bytes32(0)
        });

        _addOpenMatch(matchId);
        emit MatchCreated(matchId, msg.sender, ticketId, uint64(block.timestamp));
    }

    /**
     * @notice Join an open match by staking your own ticket.
     * @dev Starts the match and derives a shared `gameSeed` for deterministic deck shuffle.
     */
    function joinMatch(uint256 matchId, uint256 ticketId) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.Waiting) revert BadStatus();
        if (msg.sender == m.player1) revert CannotPlayYourself();
        if (ticketId == m.ticket1) revert InvalidTicket();

        _pullTicket(msg.sender, ticketId);

        m.player2 = msg.sender;
        m.ticket2 = ticketId;
        m.status = MatchStatus.Active;
        m.startedAt = uint64(block.timestamp);

        // Shared seed: both clients shuffle the deck identically from this value.
        // Not VRF — good enough for jam / social play; dual-confirm still gates payout.
        m.gameSeed = keccak256(
            abi.encodePacked(
                block.prevrandao,
                block.timestamp,
                matchId,
                m.player1,
                msg.sender,
                m.ticket1,
                ticketId
            )
        );

        _removeOpenMatch(matchId);
        emit MatchJoined(matchId, msg.sender, ticketId, m.gameSeed, m.startedAt);
    }

    /**
     * @notice Create a challenge against a specific address (open lobby + challenge event).
     * @dev Stakes the same way as createMatch; any wallet can still join first-come.
     *      Frontend uses ChallengeCreated to highlight “you were challenged”.
     */
    function createChallenge(uint256 ticketId, address challenged)
        external
        nonReentrant
        returns (uint256 matchId)
    {
        if (challenged == address(0)) revert ZeroAddress();
        if (challenged == msg.sender) revert CannotPlayYourself();

        _pullTicket(msg.sender, ticketId);

        matchId = nextMatchId++;
        matches[matchId] = Match({
            player1: msg.sender,
            player2: address(0),
            ticket1: ticketId,
            ticket2: 0,
            status: MatchStatus.Waiting,
            player1Result: address(0),
            player2Result: address(0),
            createdAt: uint64(block.timestamp),
            startedAt: 0,
            gameSeed: bytes32(0)
        });

        _addOpenMatch(matchId);
        emit MatchCreated(matchId, msg.sender, ticketId, uint64(block.timestamp));
        emit ChallengeCreated(matchId, msg.sender, challenged, ticketId);
    }

    /**
     * @notice Submit who won the Whot game. When both players submit the same winner,
     *         both staked tickets are transferred to that winner.
     * @param matchId Active match
     * @param winner Must be player1 or player2
     */
    function submitResult(uint256 matchId, address winner) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.Active) revert BadStatus();
        if (msg.sender != m.player1 && msg.sender != m.player2) revert NotPlayer();
        if (winner != m.player1 && winner != m.player2) revert InvalidWinner();

        if (msg.sender == m.player1) {
            if (m.player1Result != address(0)) revert AlreadySubmitted();
            m.player1Result = winner;
        } else {
            if (m.player2Result != address(0)) revert AlreadySubmitted();
            m.player2Result = winner;
        }

        emit ResultSubmitted(matchId, msg.sender, winner);

        // Dual confirmation → resolve
        if (
            m.player1Result != address(0) &&
            m.player2Result != address(0) &&
            m.player1Result == m.player2Result
        ) {
            _resolve(matchId, m.player1Result);
        }
    }

    /**
     * @notice Change your submitted result before both agree (e.g. mistype).
     */
    function updateResult(uint256 matchId, address winner) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.Active) revert BadStatus();
        if (msg.sender != m.player1 && msg.sender != m.player2) revert NotPlayer();
        if (winner != m.player1 && winner != m.player2) revert InvalidWinner();

        if (msg.sender == m.player1) {
            m.player1Result = winner;
        } else {
            m.player2Result = winner;
        }

        emit ResultSubmitted(matchId, msg.sender, winner);

        if (
            m.player1Result != address(0) &&
            m.player2Result != address(0) &&
            m.player1Result == m.player2Result
        ) {
            _resolve(matchId, m.player1Result);
        }
    }

    /**
     * @notice Cancel a Waiting match (creator anytime, or anyone after WAITING_TIMEOUT).
     */
    function cancelWaiting(uint256 matchId) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.Waiting) revert BadStatus();

        bool isCreator = msg.sender == m.player1;
        bool timedOut = block.timestamp >= m.createdAt + WAITING_TIMEOUT;
        if (!isCreator && !timedOut) revert TimeoutNotReached();

        m.status = MatchStatus.Cancelled;
        _removeOpenMatch(matchId);
        ticketNFT.safeTransferFrom(address(this), m.player1, m.ticket1);

        emit MatchCancelled(matchId, "waiting_cancelled");
    }

    /**
     * @notice After RESULT_TIMEOUT, either player can unwind and return both tickets
     *         if the match was never dual-confirmed (disagreement or abandonment).
     */
    function cancelActive(uint256 matchId) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.Active) revert BadStatus();
        if (msg.sender != m.player1 && msg.sender != m.player2) revert NotPlayer();
        if (block.timestamp < m.startedAt + RESULT_TIMEOUT) revert TimeoutNotReached();

        m.status = MatchStatus.Cancelled;
        ticketNFT.safeTransferFrom(address(this), m.player1, m.ticket1);
        ticketNFT.safeTransferFrom(address(this), m.player2, m.ticket2);

        emit MatchCancelled(matchId, "active_timeout");
    }

    /**
     * @notice Post an opaque move payload for peer sync (optional multiplayer without a backend).
     * @dev Contract does not validate Whot rules — clients reconstruct state from MovePosted events.
     */
    function postMove(uint256 matchId, bytes calldata payload) external {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.Active) revert BadStatus();
        if (msg.sender != m.player1 && msg.sender != m.player2) revert NotPlayer();

        // moveIndex is not stored; listeners order by log index / block
        emit MovePosted(matchId, msg.sender, block.number, payload);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────

    function getMatch(uint256 matchId) external view returns (Match memory) {
        return matches[matchId];
    }

    function getOpenMatches() external view returns (uint256[] memory) {
        return _openMatchIds;
    }

    function openMatchCount() external view returns (uint256) {
        return _openMatchIds.length;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────

    function _pullTicket(address from, uint256 ticketId) internal {
        if (ticketNFT.ownerOf(ticketId) != from) revert NotTicketOwner();
        ticketNFT.safeTransferFrom(from, address(this), ticketId);
    }

    function _resolve(uint256 matchId, address winner) internal {
        Match storage m = matches[matchId];
        m.status = MatchStatus.Resolved;

        ticketNFT.safeTransferFrom(address(this), winner, m.ticket1);
        ticketNFT.safeTransferFrom(address(this), winner, m.ticket2);

        emit MatchResolved(matchId, winner, m.ticket1, m.ticket2);
    }

    function _addOpenMatch(uint256 matchId) internal {
        _openMatchIds.push(matchId);
        _openMatchIndex[matchId] = _openMatchIds.length; // 1-based
    }

    function _removeOpenMatch(uint256 matchId) internal {
        uint256 idxPlus = _openMatchIndex[matchId];
        if (idxPlus == 0) return;
        uint256 idx = idxPlus - 1;
        uint256 last = _openMatchIds.length - 1;
        if (idx != last) {
            uint256 moved = _openMatchIds[last];
            _openMatchIds[idx] = moved;
            _openMatchIndex[moved] = idx + 1;
        }
        _openMatchIds.pop();
        delete _openMatchIndex[matchId];
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }
}
