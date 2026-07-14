@echo off
echo Starting GST Consolidater with detailed network logging...
set ELECTRON_ENABLE_LOGGING=1
set NODE_DEBUG=http,https,net

"RECO WITH VASWANI.exe"
pause