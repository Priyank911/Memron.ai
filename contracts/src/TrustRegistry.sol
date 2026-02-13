// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/**
 * @title TrustRegistry
 * @notice On-chain collaborative memory trust scores for Memron AI.
 *         Agents attest to each other's trustworthiness based on memory exchange quality.
 */
contract TrustRegistry {
    struct TrustScore {
        uint256 score;           // 0-1000
        uint256 attestationCount;
        uint256 lastUpdated;
        bool exists;
    }

    struct Attestation {
        address from;
        address to;
        uint256 score;
        string reason;
        uint256 timestamp;
    }

    mapping(address => TrustScore) public scores;
    Attestation[] public attestations;

    event TrustAttested(address indexed from, address indexed to, uint256 score, string reason);
    event ScoreUpdated(address indexed agent, uint256 newScore);

    /**
     * @notice Submit a trust attestation for another agent
     * @param to The agent being attested
     * @param score Trust score (0-1000)
     * @param reason Human-readable reason
     */
    function attest(address to, uint256 score, string calldata reason) external {
        require(msg.sender != to, "Self-attestation not allowed");
        require(score <= 1000, "Score must be 0-1000");

        attestations.push(Attestation({
            from: msg.sender,
            to: to,
            score: score,
            reason: reason,
            timestamp: block.timestamp
        }));

        _recalculateScore(to);

        emit TrustAttested(msg.sender, to, score, reason);
    }

    function getScore(address agent) external view returns (uint256) {
        return scores[agent].score;
    }

    function getAttestationCount() external view returns (uint256) {
        return attestations.length;
    }

    function _recalculateScore(address agent) internal {
        uint256 total = 0;
        uint256 count = 0;

        for (uint256 i = 0; i < attestations.length; i++) {
            if (attestations[i].to == agent) {
                total += attestations[i].score;
                count++;
            }
        }

        if (count > 0) {
            scores[agent] = TrustScore({
                score: total / count,
                attestationCount: count,
                lastUpdated: block.timestamp,
                exists: true
            });
            emit ScoreUpdated(agent, total / count);
        }
    }
}
