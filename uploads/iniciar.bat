@echo off
title Servidor Eporner API + Site
echo ====================================================
echo Iniciando o site e o proxy da API Eporner...
echo Acesse: http://localhost:3000
echo ====================================================
start http://localhost:3000
node server.js
pause
