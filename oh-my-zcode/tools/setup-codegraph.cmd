@echo off
rem Bootstrap local du serveur codegraph du plugin oh-my-zcode.
rem Une seule commande, 100%% locale : aucune install globale, aucun PATH.
rem npm tire automatiquement le binaire de plateforme de cette machine
rem (win32-x64 ici ; darwin/linux sur mac/linux).
cd /d "%~dp0..\vendor\codegraph" || exit /b 1
if not exist package.json echo {"name":"oh-my-zcode-vendor-codegraph","private":true} > package.json
call npm install --no-audit --no-fund || exit /b 1
if not exist node_modules\@colbymchenry\codegraph\npm-shim.js (
  echo ECHEC: le shim codegraph est absent apres l'installation.
  exit /b 1
)
echo OK: codegraph installe localement (~250 Mo dans vendor\codegraph\node_modules,
echo     ignores par git). Redemarre ZCode pour que le serveur se charge.
