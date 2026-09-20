@echo off
cd /d "%~dp0"
echo Verification de MetaTrader5 (installation automatique si besoin)...
python -c "import MetaTrader5" 2>nul
if errorlevel 1 (
    python -m pip install MetaTrader5
)
echo.
echo Assure-toi que MT5 est ouvert et connecte a ton compte, puis appuie sur une touche.
pause >nul
python export_mt5.py --loop
pause
