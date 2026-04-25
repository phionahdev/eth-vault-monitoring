# Aderyn Security Report - ETH Vault (UUPS)

## Scope
- `contracts/VaultV1.sol`
- `contracts/VaultV2.sol`

## Command
```bash
aderyn . --src contracts --output aderyn_report.md
```

## Findings

### 1) High - Uninitialized Implementation (Proxy-specific)
- **Status:** Fixed
- **Description:** If the implementation is left initializable, attackers can call `initialize()` directly and seize ownership.
- **Remediation applied:** Added `_disableInitializers()` in constructor of `VaultV1`.
- **Verification:** Constructor now prevents initialization on implementation contract.

### 2) Medium - Reentrancy Risk in `withdraw`
- **Status:** Fixed
- **Description:** External ETH transfer via `.call` may be re-entered if state changes are not guarded.
- **Remediation applied:** Added `ReentrancyGuardUpgradeable` and `nonReentrant` modifier on `deposit` and `withdraw`.
- **Verification:** State updated before transfer and reentrancy guard active.

### 3) Informational - Reward calculation precision
- **Status:** Accepted
- **Description:** Integer math truncates fractional wei rewards.
- **Rationale:** Expected and acceptable for gas-efficient on-chain arithmetic.

## Final Security Notes
- UUPS authorization is restricted via `onlyOwner` in `_authorizeUpgrade`.
- Storage layout preserved in `VaultV2` by appending logic only and reusing inherited state.
- Upgrade simulation is documented in `tenderly_upgrade.md`.
