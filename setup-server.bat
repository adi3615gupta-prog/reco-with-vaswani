@echo off
echo ========================================================
echo   RECO WITH VASWANI - Server Setup & Launch Script
echo ========================================================
echo.
echo Installing production dependencies...
call npm install --production
echo.
echo Launching Server on port 3001...
echo.
echo Once the server says "Connected to SQLite Database", 
echo clients can connect by opening Google Chrome and navigating to:
echo http://localhost:3001
echo (Replace localhost with this computer's IP address for other PCs on the network)
echo.
node server.js
pause
