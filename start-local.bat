@echo off
echo Starting Trading Scanner locally...
echo.

echo Starting Backend...
start "Backend" cmd /k "cd backend && npm start"

timeout /t 5 /nobreak

echo Starting Frontend...  
start "Frontend" cmd /k "cd frontend && npm start"

echo.
echo ✅ Both services starting...
echo 📊 Backend will be on: http://localhost:5000
echo 🌐 Frontend will be on: http://localhost:3000
echo.
echo Press any key to continue...
pause