@echo off
echo 🚀 Installing dependencies for Trading Scanner...

cd backend
echo 📦 Installing backend dependencies...
npm install
if %ERRORLEVEL% neq 0 (
    echo ❌ Backend install failed
    pause
    exit /b 1
)

cd ../frontend
echo 📦 Installing frontend dependencies...
npm install
if %ERRORLEVEL% neq 0 (
    echo ❌ Frontend install failed
    pause
    exit /b 1
)

echo ✅ All dependencies installed successfully!
echo 🎯 Run "start-scanner.bat" to launch the application
pause