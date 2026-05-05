# relay_proxy Contract Build Fix

## Problem
The relay_proxy contract compilation to wasm32-unknown-unknown fails with:
```
error: distributed_slice is not implemented for this platform
error[E0425]: cannot find value `LINKME_START`, `LINKME_STOP`, `DUPCHECK_START`, `DUPCHECK_STOP`
```

## Root Cause
- **Rust 1.95.0** (latest) uses **ink! 5.0** with cargo-contract 5.0.0
- **ink! 5.0** depends on `ink_metadata` which uses `linkme` crate
- `linkme` requires linker sections that **don't exist on wasm32-unknown-unknown**
- Wasm platform doesn't support distributed linker sections

## Solution
Downgrade to a compatible toolchain:
- **Rust:** 1.81.0
- **cargo-contract:** 4.x
- **ink!:** 4.3.0 (automatically pulled by cargo-contract 4.x)

Ink! 4.3.0 does NOT use linkme and compiles successfully to wasm.

---

## Step-by-Step Fix

### Step 1: Set Rust to 1.81.0
```powershell
rustup default 1.81.0
rustc --version
```
**Expected output:** `rustc 1.81.0 (...)`

### Step 2: Install wasm target for 1.81.0
```powershell
rustup target add wasm32-unknown-unknown
```
**Expected output:** `rust-std installed ... MiB`

### Step 3: Verify Cargo.toml has ink 4.3.0
File: `c:\Users\abdoulaahmad\Documents\relayer\contracts\relay_proxy\Cargo.toml`

**Should contain:**
```toml
[dependencies]
ink = { version = "=4.3.0", default-features = false }
scale = { package = "parity-scale-codec", version = "3", default-features = false, features = ["derive"] }
scale-info = { version = "2", default-features = false, features = ["derive"], optional = true }

[features]
default = ["std"]
std = [
    "ink/std",
    "scale/std",
    "scale-info/std",
]
```

✅ **Current Cargo.toml is already correct with ink 4.3.0**

### Step 4: Clean previous build artifacts
```powershell
cd c:\Users\abdoulaahmad\Documents\relayer\contracts\relay_proxy
Remove-Item -Recurse -Force target -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force Cargo.lock -ErrorAction SilentlyContinue
```

### Step 5: Set environment variables for Windows
```powershell
$env:TMP='C:\tmp'
$env:TEMP='C:\tmp'
$env:CARGO_TARGET_DIR='C:\cargo-target'
```

### Step 6: Build the contract
```powershell
cargo contract build
```

**Expected output:**
```
 [==] Checking clippy linting rules
   Compiling ... (multiple packages)
   Finished release [optimized] target(s) in X.XXs
   Generating bundle...
   bundle written to: C:\Users\abdoulaahmad\Documents\relayer\contracts\relay_proxy\target\ink\relay_proxy\release
```

### Step 7: Verify the wasm binary was created
```powershell
ls c:\Users\abdoulaahmad\Documents\relayer\contracts\relay_proxy\target\ink\relay_proxy\release
```

**Expected files:**
- `relay_proxy.wasm` (the contract binary)
- `metadata.json` (contract metadata)

---

## Summary of Changes

| Item | Before | After |
|------|--------|-------|
| Rust Version | 1.95.0 | 1.81.0 |
| cargo-contract | 5.0.0 | 4.x |
| ink! | 5.0 | 4.3.0 |
| Problem | linkme distributed_slice incompatible with wasm | ✅ Resolved |

---

## If Build Still Fails

1. **Check Rust version:** `rustc --version` should be `1.81.0`
2. **Check wasm target:** `rustup target list | grep wasm32` should show `wasm32-unknown-unknown (installed)`
3. **Clear cargo cache:** `cargo clean`
4. **Check temp paths are set:** Verify PowerShell session has the three env vars before running cargo
5. **Try full clean:** Delete `C:\cargo-target` folder and retry

---

## Next Steps After Build Succeeds

1. Build rentlock contract (same process)
2. Deploy both wasm binaries to VPS node
3. Update relayer config with contract addresses
4. Wire relayer service to call contracts
5. Build React frontend

