@echo off
rem Windows counterpart of the Makefile. Usage: make.bat <target>
setlocal
cd /d "%~dp0"

set "VENV=venv"
set "PYBIN=%VENV%\Scripts\python.exe"
set "REQ=requirements.txt"

set "TARGET=%~1"
if "%TARGET%"=="" set "TARGET=help"

if /i "%TARGET%"=="help"                   goto :help
if /i "%TARGET%"=="env"                    goto :env
if /i "%TARGET%"=="install"                goto :install
if /i "%TARGET%"=="clean"                  goto :clean
if /i "%TARGET%"=="clean-kernel"           goto :clean_kernel
if /i "%TARGET%"=="clean-all"              goto :clean_all
if /i "%TARGET%"=="generate-catalog"       goto :generate_catalog
if /i "%TARGET%"=="generate-html"          goto :generate_html
if /i "%TARGET%"=="generate-symbols"       goto :generate_symbols
if /i "%TARGET%"=="generate-check-symbols" goto :generate_check_symbols
if /i "%TARGET%"=="generate-all"           goto :generate_all

echo Unknown target: %TARGET%
echo.
call :help
exit /b 1

:help
echo make.bat env                     -^> create virtualenv
echo make.bat install                 -^> install dependencies from %REQ%
echo make.bat generate-catalog        -^> run generate_spell_catalog.py
echo make.bat generate-html           -^> run generate_html.py
echo make.bat generate-symbols        -^> run generate_processed_symbols.py
echo make.bat generate-check-symbols  -^> run generate_check_symbols.py
echo make.bat generate-all            -^> run the full pipeline (catalog -^> html)
echo make.bat clean                   -^> cleanup pyc and caches
echo make.bat clean-kernel            -^> remove the virtualenv
echo make.bat clean-all               -^> clean + clean-kernel
exit /b 0

rem ---- Environment ----

:env
if exist "%PYBIN%" exit /b 0
where py >nul 2>nul && (py -3 -m venv %VENV%) || (python -m venv %VENV%)
exit /b %ERRORLEVEL%

:install
call :env || exit /b 1
"%PYBIN%" -m pip install --upgrade pip || exit /b 1
"%PYBIN%" -m pip install -r %REQ%
exit /b %ERRORLEVEL%

rem ---- Cleanup ----

:clean
del /s /q *.pyc >nul 2>nul
for /d /r . %%d in (__pycache__ .pytest_cache) do if exist "%%d" rd /s /q "%%d"
exit /b 0

:clean_kernel
if exist "%VENV%" rd /s /q "%VENV%"
exit /b 0

:clean_all
call :clean
call :clean_kernel
exit /b 0

rem ---- Generators ----

:check_venv
if exist "%PYBIN%" exit /b 0
echo venv not found. Run "make.bat install" first.
exit /b 1

rem Step 1: parse raw spell markdown into database/spells/processed/spells.json
:generate_catalog
call :check_venv || exit /b 1
"%PYBIN%" generate_spell_catalog.py
exit /b %ERRORLEVEL%

rem Step 2: build the self-contained spellbook.html from the processed catalog
:generate_html
call :check_venv || exit /b 1
"%PYBIN%" generate_html.py
exit /b %ERRORLEVEL%

rem Process raw sigil SVGs into cleaned SVGs plus metadata JSON
:generate_symbols
call :check_venv || exit /b 1
"%PYBIN%" generate_processed_symbols.py
exit /b %ERRORLEVEL%

rem Render check SVGs overlaying topology slots on the base sigil art
:generate_check_symbols
call :check_venv || exit /b 1
"%PYBIN%" generate_check_symbols.py
exit /b %ERRORLEVEL%

rem Full spellbook pipeline: catalog then html
:generate_all
call :generate_catalog || exit /b 1
call :generate_html
exit /b %ERRORLEVEL%
