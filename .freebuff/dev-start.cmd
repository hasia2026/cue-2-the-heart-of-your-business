@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0.."
npm run dev > .freebuff\preview-174a84b0-28f3-4368-9096-5b8328a49b76.log 2> .freebuff\preview-174a84b0-28f3-4368-9096-5b8328a49b76.log.err
