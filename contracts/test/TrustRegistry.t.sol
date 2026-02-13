// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/TrustRegistry.sol";

contract TrustRegistryTest is Test {
    TrustRegistry registry;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        registry = new TrustRegistry();
    }

    function test_attest() public {
        vm.prank(alice);
        registry.attest(bob, 800, "Good memory exchange");
        assertEq(registry.getScore(bob), 800);
    }

    function test_revert_selfAttestation() public {
        vm.prank(alice);
        vm.expectRevert("Self-attestation not allowed");
        registry.attest(alice, 500, "Self");
    }

    function test_revert_scoreOutOfRange() public {
        vm.prank(alice);
        vm.expectRevert("Score must be 0-1000");
        registry.attest(bob, 1001, "Too high");
    }
}
