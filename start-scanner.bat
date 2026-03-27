@echo off
echo 🚀 Starting Trading Scanner Application...

echo 📊 Starting Backend Server on port 5000...
start "Trading Scanner Backend" cmd /k "cd backend && npm start"

timeout /t 3

echo ⚛️ Starting React Frontend on port 3000...
start "Trading Scanner Frontend" cmd /k "cd frontend && npm start"

echo ✅ Both servers started!
echo 📊 Backend: http://localhost:5000
echo ⚛️ Frontend: http://localhost:3000
echo 🎯 Scanner will use real Chartink data and Kite Connect API
pause