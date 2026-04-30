# Script para iniciar as 5 instâncias do Chatbot simultaneamente

Write-Host "🚀 Iniciando as 5 instâncias do Chatbot..." -ForegroundColor Cyan

# Porta 1 - Dyoli (3001)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npx tsx src/index.ts dyoli" -WindowStyle Normal

# Porta 2 - Natan (3002)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npx tsx src/index.ts natan" -WindowStyle Normal

# Porta 3 - Fernanda (3003)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npx tsx src/index.ts fernanda" -WindowStyle Normal

# Porta 4 - Estúdio 4 (3004)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npx tsx src/index.ts estudio4" -WindowStyle Normal

# Porta 5 - Estúdio 5 (3005)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npx tsx src/index.ts estudio5" -WindowStyle Normal

Write-Host "✅ Todas as 5 instâncias foram disparadas em janelas separadas!" -ForegroundColor Green
Write-Host "Portas: 3001, 3002, 3003, 3004, 3005"
