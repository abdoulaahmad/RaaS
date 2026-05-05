# WSL2 Setup for Contract Compilation

## Prerequisites Check
- Windows 10 Version 2004 or higher (or Windows 11)
- 20 GB free disk space recommended

---

## Step 1: Enable WSL2

Open **PowerShell as Administrator** and run:

```powershell
wsl --install
```

This will:
- Enable Windows Subsystem for Linux
- Install WSL2 (virtual machine mode)
- Download and install Ubuntu (latest LTS)

**After installation completes:**
- Restart your computer when prompted
- WSL will finish setup on next boot

---

## Step 2: Set Default WSL Version to 2

```powershell
wsl --set-default-version 2
```

---

## Step 3: Launch Ubuntu Terminal

After restart, search for **Ubuntu** in Windows Start menu and launch it.

On first launch, it will:
- Complete setup
- Ask you to create a username (use your preference, e.g., `developer`)
- Ask for a password

**Note:** Password characters won't show when typing (normal behavior).

---

## Step 4: Update Ubuntu Packages

Inside the Ubuntu terminal:

```bash
sudo apt update && sudo apt upgrade -y
```

---

## Step 5: Install Rust in WSL

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

When prompted, select option **1** (default installation).

After installation, reload your shell:

```bash
source $HOME/.cargo/env
```

Verify Rust installed:

```bash
rustc --version
cargo --version
```

---

## Step 6: Install Wasm Target

```bash
rustup target add wasm32-unknown-unknown
```

---

## Step 7: Install cargo-contract 4.1.1

```bash
cargo install cargo-contract --version 4.1.1 --locked
```

This takes 3-5 minutes. Wait for completion.

Verify installation:

```bash
cargo contract --version
```

Expected output: `cargo-contract 4.1.1`

---

## Step 8: Navigate to Your Project

Copy your relayer project into WSL. You have two options:

### Option A: Access Windows files from WSL (easiest)

```bash
cd /mnt/c/Users/abdoulaahmad/Documents/relayer/contracts/relay_proxy
ls
```

This allows you to work with Windows files directly without copying.

### Option B: Copy to WSL (faster builds)

```bash
cp -r /mnt/c/Users/abdoulaahmad/Documents/relayer ~/relayer
cd ~/relayer/contracts/relay_proxy
```

---

## Step 9: Build the Contract

```bash
cargo contract build
```

**Expected output:**
```
 [==] Checking clippy linting rules
   Compiling relay_proxy v1.0.0 (...)
   Finished release [optimized] target(s) in X.XXs
   Generating bundle...
   bundle written to: /path/to/target/ink/relay_proxy/release
```

---

## Step 10: Verify Wasm Binary

```bash
ls target/ink/relay_proxy/release/
```

Should show:
- `relay_proxy.wasm` ✅
- `metadata.json` ✅
- `relay_proxy.contract` ✅

---

## Step 11: Copy Binaries Back to Windows (if needed)

If you built in WSL home directory, copy the wasm binary back to Windows:

```bash
cp target/ink/relay_proxy/release/relay_proxy.wasm /mnt/c/Users/abdoulaahmad/Documents/relayer/artifacts/
```

---

## Build rentlock Contract

After relay_proxy succeeds, build rentlock the same way:

```bash
cd ~/relayer/contracts/rentlock
cargo contract build
```

---

## Useful WSL Commands

| Command | Purpose |
|---------|---------|
| `wsl` | Launch default WSL Ubuntu |
| `wsl --list --verbose` | List WSL distros |
| `wsl --terminate Ubuntu` | Stop WSL |
| `explorer.exe .` | Open current folder in Windows Explorer |
| `code .` | Open in VS Code (if code CLI installed) |

---

## Troubleshooting

**Issue:** "command not found: rustc"
- **Fix:** `source $HOME/.cargo/env`

**Issue:** "distributed_slice is not implemented for this platform"
- **Fix:** You're still on Rust 1.95.0. Verify `rustc --version` shows 1.81.0 or newer

**Issue:** Build is very slow
- **Fix:** Copy project to `~/` instead of `/mnt/c/` (Windows FS is slower in WSL)

**Issue:** Out of disk space
- **Fix:** `df -h` to check usage. Clean with `cargo clean` if needed

---

## After Successful Build

1. ✅ Copy `.wasm` and `.contract` files to Windows artifacts folder
2. ✅ Update relayer config with contract addresses
3. ✅ Deploy to VPS node
4. ✅ Build React frontend

