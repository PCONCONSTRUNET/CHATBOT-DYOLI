import 'dotenv/config';

const BASE_URL = process.env.SUPABASE_FUNCTIONS_URL;
const BOT_SECRET = process.env.BOT_API_SECRET;

async function call(endpoint: string, body: any = {}) {
  if (!BASE_URL || !BOT_SECRET) {
      throw new Error("Faltando SUPABASE_FUNCTIONS_URL ou BOT_API_SECRET no arquivo .env");
  }

  const res = await fetch(`${BASE_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bot-secret': BOT_SECRET,
    },
    body: JSON.stringify(body),
  });
  
  const data = await res.json();
  
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export const lovable = {
  // Lista todos os serviços ativos
  listarServicos: () => call('bot-servicos'),

  // Horários livres em uma data (formato YYYY-MM-DD)
  horariosDisponiveis: (servico_id: string, data: string) =>
    call('bot-horarios-disponiveis', { servico_id, data }),

  // Cria agendamento + conta automática do cliente
  agendar: (params: { whatsapp: string, nome: string, servico_id: string, data: string, horario: string, variacao?: string, forma_pagamento?: string }) => 
    call('bot-agendar', params),

  // Lista agendamentos do cliente por WhatsApp
  meusAgendamentos: (whatsapp: string, status?: 'pendente' | 'confirmado' | 'concluido' | 'cancelado' | 'falta') =>
    call('bot-meus-agendamentos', { whatsapp, status }),

  // IA para interpretar mensagens livres do cliente
  iaFallback: (mensagem: string, contexto: any = {}) =>
    call('bot-ia-fallback', { mensagem, contexto }),
};
