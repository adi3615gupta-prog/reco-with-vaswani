# RECO WITH VASWANI - Dependency Restoration Script
# Runs in PowerShell / Windows Terminal
# Installs Node.js, Python, NPM modules, and Python libraries

$ErrorActionPreference = "Stop"

# Helper to write section headers
function Write-Header($text) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""
}

# Helper to refresh PATH variable for current session
function Refresh-Path {
    Write-Host "Refreshing PATH environment variables for the current session..." -ForegroundColor Yellow
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}

Write-Header "RECO WITH VASWANI - Dependency Restorer"

# Check if script is run in the root directory
if (!(Test-Path "package.json")) {
    Write-Host "[-] ERROR: package.json not found! Please run this script from the project root directory." -ForegroundColor Red
    Write-Host "    Current location: $PWD" -ForegroundColor Yellow
    Read-Host "Press Enter to exit..."
    Exit
}

# ----------------- 1. Check / Install Node.js -----------------
Write-Host "[1/4] Checking Node.js installation..." -ForegroundColor Green
$NodeInstalled = $false
try {
    $NodeVersion = & node -v
    Write-Host "[+] Node.js is already installed: $NodeVersion" -ForegroundColor Green
    $NodeInstalled = $true
} catch {
    Write-Host "[-] Node.js is not detected in PATH. Attempting installation via winget..." -ForegroundColor Yellow
    try {
        & winget install --id OpenJS.NodeJS -e --source winget --accept-package-agreements --accept-source-agreements
        Write-Host "[+] Node.js installation triggered successfully!" -ForegroundColor Green
        Refresh-Path
    } catch {
        Write-Host "[-] ERROR: Failed to install Node.js automatically via winget." -ForegroundColor Red
        Write-Host "    Please download and install it manually from https://nodejs.org/" -ForegroundColor Yellow
        Read-Host "Press Enter to exit..."
        Exit
    }
}

# ----------------- 2. Check / Install Python 3.13 -----------------
Write-Host ""
Write-Host "[2/4] Checking Python 3.13 installation..." -ForegroundColor Green
$PythonInstalled = $false
try {
    # Check if python runs and check its version
    $PythonVersion = & python --version 2>&1
    Write-Host "[+] Python is already installed: $PythonVersion" -ForegroundColor Green
    $PythonInstalled = $true
} catch {
    Write-Host "[-] Python is not detected in PATH. Attempting to install Python 3.13 via winget..." -ForegroundColor Yellow
    try {
        & winget install --id Python.Python.3.13 -e --source winget --accept-package-agreements --accept-source-agreements
        Write-Host "[+] Python 3.13 installation triggered successfully!" -ForegroundColor Green
        Refresh-Path
    } catch {
        Write-Host "[-] ERROR: Failed to install Python automatically via winget." -ForegroundColor Red
        Write-Host "    Please download and install Python 3.13 manually from https://www.python.org/" -ForegroundColor Yellow
        Read-Host "Press Enter to exit..."
        Exit
    }
}

# Double check executable status after potential installations
Refresh-Path

# ----------------- 3. Install NPM Packages -----------------
Write-Header "Installing Node.js (NPM) Packages"
try {
    Write-Host "Running npm install..." -ForegroundColor Yellow
    & npm install
    Write-Host "[+] NPM Packages installed successfully!" -ForegroundColor Green
} catch {
    Write-Host "[-] ERROR: npm install failed." -ForegroundColor Red
    Write-Host "    Please verify Node.js is working and try running 'npm install' manually." -ForegroundColor Yellow
    Read-Host "Press Enter to exit..."
    Exit
}

# ----------------- 4. Install Python Packages -----------------
Write-Header "Installing Python Libraries"

# Check if pip is available
try {
    Write-Host "Upgrading pip..." -ForegroundColor Yellow
    & python -m pip install --upgrade pip
} catch {
    Write-Host "[-] Warning: Could not upgrade pip, trying to continue with library installation..." -ForegroundColor Yellow
}

# Install from root requirements.txt
if (Test-Path "requirements.txt") {
    try {
        Write-Host "Installing root Python requirements (rapidfuzz)..." -ForegroundColor Yellow
        & python -m pip install -r requirements.txt
        Write-Host "[+] Root Python requirements installed successfully!" -ForegroundColor Green
    } catch {
        Write-Host "[-] ERROR: Failed to install dependencies from requirements.txt." -ForegroundColor Red
        Read-Host "Press Enter to exit..."
        Exit
    }
}

# Install from LevitateExtract/requirements.txt
if (Test-Path "LevitateExtract/requirements.txt") {
    try {
        Write-Host "Installing LevitateExtract microservice requirements (fastapi, uvicorn, PyMuPDF, pandas, openpyxl)..." -ForegroundColor Yellow
        & python -m pip install -r LevitateExtract/requirements.txt
        Write-Host "[+] LevitateExtract requirements installed successfully!" -ForegroundColor Green
    } catch {
        Write-Host "[-] ERROR: Failed to install dependencies from LevitateExtract/requirements.txt." -ForegroundColor Red
        Read-Host "Press Enter to exit..."
        Exit
    }
}

# ----------------- 5. Verification -----------------
Write-Header "Verification & Verification Checklist"

$AllPass = $true

Write-Host "Checking Node.js: " -NoNewline
try {
    $v = & node -v
    Write-Host "OK ($v)" -ForegroundColor Green
} catch {
    Write-Host "FAILED" -ForegroundColor Red
    $AllPass = $false
}

Write-Host "Checking NPM: " -NoNewline
try {
    $v = & npm -v
    Write-Host "OK ($v)" -ForegroundColor Green
} catch {
    Write-Host "FAILED" -ForegroundColor Red
    $AllPass = $false
}

Write-Host "Checking Python: " -NoNewline
try {
    $v = & python --version 2>&1
    Write-Host "OK ($v)" -ForegroundColor Green
} catch {
    Write-Host "FAILED" -ForegroundColor Red
    $AllPass = $false
}

Write-Host "Checking Python libraries (pandas, openpyxl, fitz, fastapi): " -NoNewline
try {
    & python -c "import pandas; import openpyxl; import fitz; import fastapi; print('Loaded successfully')"
    Write-Host "OK" -ForegroundColor Green
} catch {
    Write-Host "FAILED" -ForegroundColor Red
    $AllPass = $false
}

Write-Host ""
if ($AllPass) {
    Write-Host "[+++] ALL DEPENDENCIES RESTORED SUCCESSFULLY! [+++]" -ForegroundColor Green
    Write-Host "You can now run 'npm run dev' to start the development server," -ForegroundColor Green
    Write-Host "or 'npm run electron:dev' to run the Electron desktop app." -ForegroundColor Green
} else {
    Write-Host "[---] SOME DEPENDENCIES ARE STILL MISSING OR UNHEALTHY [---]" -ForegroundColor Red
    Write-Host "Please check the logs above to identify and fix failures manually." -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Setup finished. Press Enter to exit..."
