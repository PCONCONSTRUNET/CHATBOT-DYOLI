import type { InstanceConfig } from './config.js';
import { SEPARATOR, formatMsg } from './utils.js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';



/**
 * Sistema de Lembretes Automáticos
 * 
 * Roda em loop a cada 5 minutos e verifica se há agendamentos
 * próximos que precisam de lembrete.
 * 
 * - 24h antes: "Amanhã você tem um agendamento..."
 * - 1h antes:  "Falta 1 hora para o seu agendamento..."
 * 
 * Usa uma coluna `lembrete_24h_enviado` e `lembrete_1h_enviado` 
 * na tabela de agendamentos para não duplicar.
 */

interface ReminderContext {
    config: InstanceConfig;
    supabase: SupabaseClient;
    sendWhatsApp: (jid: string, text: string) => Promise<void>;
}

/**
 * Busca agendamentos que precisam de lembrete e envia via WhatsApp
 */
async function checkAndSendReminders(ctx: ReminderContext) {
    const { config, supabase, sendWhatsApp } = ctx;
    const prefix = `[🔔 ${config.id}]`;

    try {
        const now = new Date();

        // ===== LEMBRETE 24H =====
        if (config.reminder24h) {
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            const tomorrowDate = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

            const { data: appointments24h, error: err24 } = await supabase
                .from('appointments')
                .select('id, customer_whatsapp, customer_name, time, services(name)')
                .eq('date', tomorrowDate)
                .in('status', ['pendente', 'confirmado'])
                .or('reminder_24h_sent.is.null,reminder_24h_sent.eq.false');

            if (err24) {
                console.error(`${prefix} Erro ao buscar lembretes 24h:`, err24.message);
            } else if (appointments24h && appointments24h.length > 0) {
                console.log(`${prefix} 📨 ${appointments24h.length} lembretes de 24h para enviar`);

                for (const apt of appointments24h) {
                    try {
                        const phone = (apt.customer_whatsapp || '').replace(/\D/g, '');
                        if (!phone) continue;

                        const serviceName = (apt as any).services?.name || 'seu procedimento';
                        const hora = apt.time || 'horário marcado';
                        const nomeCliente = apt.customer_name || 'Cliente';

                        const vars = {
                            cliente: nomeCliente,
                            nome: nomeCliente,
                            empresa: config.name,
                            servico: serviceName,
                            hora: hora
                        };

                        const text = formatMsg(config.messages?.reminder24h || 
                            `⏰ *LEMBRETE DE AGENDAMENTO*\n\n${SEPARATOR}\n\nOlá, *{CLIENTE}*! 👋\n\n📅 *Amanhã* você tem um agendamento na *{EMPRESA}*:\n\n✂️ *Serviço:* {SERVICO}\n🕐 *Horário:* {HORA}\n\n${SEPARATOR}\n\n✅ Confirme sua presença respondendo *SIM*\n❌ Para cancelar, responda *CANCELAR*\n\n_Esperamos você! 🩷_`, 
                            vars
                        );

                        const jid = `${phone}@s.whatsapp.net`;
                        await sendWhatsApp(jid, text);
                        console.log(`${prefix} ✅ Lembrete 24h enviado para ${phone}`);

                        // Marca como enviado
                        await supabase
                            .from('appointments')
                            .update({ reminder_24h_sent: true })
                            .eq('id', apt.id);
                    } catch (sendErr: any) {
                        console.error(`${prefix} Erro ao enviar lembrete 24h:`, sendErr.message);
                    }
                }
            }
        }

        // ===== LEMBRETE 1H =====
        if (config.reminder1h) {
            // Busca agendamentos que começam nas próximas 1h-1h15min
            const in1h = new Date(now.getTime() + 60 * 60 * 1000);
            const in1h15 = new Date(now.getTime() + 75 * 60 * 1000);

            const { data: appointments1h, error: err1 } = await supabase
                .from('appointments')
                .select('id, customer_whatsapp, customer_name, time, services(name)')
                .eq('date', now.toISOString().split('T')[0])
                .in('status', ['pendente', 'confirmado'])
                .or('reminder_1h_sent.is.null,reminder_1h_sent.eq.false');

            if (err1) {
                console.error(`${prefix} Erro ao buscar lembretes 1h:`, err1.message);
            } else if (appointments1h && appointments1h.length > 0) {
                console.log(`${prefix} 📨 ${appointments1h.length} lembretes de 1h para enviar`);

                for (const apt of appointments1h) {
                    try {
                        const phone = (apt.customer_whatsapp || '').replace(/\D/g, '');
                        if (!phone) continue;

                        const serviceName = (apt as any).services?.name || 'seu procedimento';
                        const nomeCliente = apt.customer_name || 'Cliente';

                        const jid = `${phone}@s.whatsapp.net`;
                        
                        const vars = {
                            cliente: nomeCliente,
                            nome: nomeCliente,
                            empresa: config.name,
                            servico: serviceName
                        };

                        const text = formatMsg(config.messages?.reminder1h || 
                            `🚨 *LEMBRETE — FALTA 1 HORA!*\n\n${SEPARATOR}\n\nOi, *${nomeCliente}*! ⏳\n\nSeu agendamento na *${config.name}* começa em *1 hora*!\n\n✂️ *Serviço:* ${serviceName}\n\n${SEPARATOR}\n\n📍 Chegue com alguns minutinhos de antecedência.\n_Te esperamos! ✨_`,
                            vars
                        );

                        await sendWhatsApp(jid, text);
                        console.log(`${prefix} ✅ Lembrete 1h enviado para ${phone}`);

                        await supabase
                            .from('appointments')
                            .update({ reminder_1h_sent: true })
                            .eq('id', apt.id);
                    } catch (sendErr: any) {
                        console.error(`${prefix} Erro ao enviar lembrete 1h:`, sendErr.message);
                    }
                }
            }
        }
    } catch (err: any) {
        console.error(`${prefix} Erro geral no sistema de lembretes:`, err.message);
    }
}

/**
 * Inicia o loop de lembretes para uma instância
 * Roda a cada 5 minutos (300.000ms)
 */
export function startReminders(
    config: InstanceConfig,
    sock: any
): NodeJS.Timeout | null {
    if (!config.supabaseUrl || !config.supabaseKey) {
        console.log(`[🔔 ${config.id}] ⚠️ Lembretes desativados (sem Supabase configurado)`);
        return null;
    }

    if (!config.reminder24h && !config.reminder1h) {
        console.log(`[🔔 ${config.id}] ⚠️ Lembretes desativados por configuração`);
        return null;
    }

    const supabase = createClient(config.supabaseUrl, config.supabaseKey);

    const sendWhatsApp = async (jid: string, text: string) => {
        if (sock?.user) {
            if ((sock as any).sendWithTyping) {
                await (sock as any).sendWithTyping(jid, { text: text });
            } else {
                await sock.sendMessage(jid, { text: text });
            }
        } else {
            throw new Error('WhatsApp não conectado');
        }
    };

    const ctx: ReminderContext = { config, supabase, sendWhatsApp };

    console.log(`[🔔 ${config.id}] ✅ Sistema de lembretes ATIVADO (24h: ${config.reminder24h ? '✅' : '❌'} | 1h: ${config.reminder1h ? '✅' : '❌'})`);

    // Roda imediatamente na primeira vez
    checkAndSendReminders(ctx);

    // Loop a cada 5 minutos
    const interval = setInterval(() => checkAndSendReminders(ctx), 5 * 60 * 1000);

    return interval;
}
