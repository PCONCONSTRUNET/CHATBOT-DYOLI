# Chatbot Multi-Instâncias

Este repositório gerencia múltiplas instâncias de chatbots do WhatsApp integrados com o Supabase e provedores de pagamento (como Mercado Pago).

⚠️ **ATENÇÃO — INSTRUÇÃO CRÍTICA PARA ASSISTENTES DE IA (AI ASSISTANTS):**
- A **Porta 01 / Instância `dyoli`** (Estúdio Dyoli Godim - Port 3001) está em produção ativa e **NÃO DEVE SER ALTERADA** de forma alguma.
- Qualquer modificação nos arquivos comuns da aplicação (como `src/index.ts`, `src/config.ts`, `src/utils.ts`, etc.) deve manter total retrocompatibilidade e **não alterar** o comportamento da instância `dyoli`.
- Não modifique o arquivo `data/instances/dyoli.json` ou as lógicas condicionais de `dyoli` no código, a menos que o usuário solicite explicitamente no prompt de comando usando os termos "dyoli" ou "Porta 01".

---

## Estrutura do Projeto

* `src/index.ts` - Servidor principal e fluxo do chatbot.
* `src/config.ts` - Carregamento de configurações por banco de dados ou JSON.
* `data/instances/` - Arquivos de configuração locais das instâncias (JSON).
* `src/reminders.ts` - Sistema de envio de lembretes automáticos.

## Como Iniciar

### Iniciar Todas as Instâncias Localmente
Para rodar todas as instâncias configuradas:
```powershell
./iniciar_todos.ps1
```
