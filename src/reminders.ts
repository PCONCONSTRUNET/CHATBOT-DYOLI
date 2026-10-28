import type { InstanceConfig } from './config.js';
import { SEPARATOR, formatMsg, resolveJid } from './utils.js';
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
 * Suporta dois schemas de banco:
 *  - 'inline'      (padrão): colunas customer_whatsapp, customer_name, date, time na tabela
 *  - 'client_join' (Camila): coluna start_at + join clients(name, phone) + join services(name)
 */

interface ReminderContext {
    config: InstanceConfig;
    supabase: SupabaseClient;
    sendWhatsApp: (jid: string, text: string) => Promise<void>;
}

/**
 * Extrai telefone e nome do agendamento, compatível com ambos os schemas
 */
function extractContactInfo(apt: any, schema: string): { phone: string; nome: string } {
    if (schema === 'client_join') {
        const phone = (apt.clients?.phone || '').toString().replace(/\D/g, '');
        const nome = apt.clients?.name || 'Cliente';
        return { phone, nome };
    }
    const phone = (apt.customer_whatsapp || '').replace(/\D/g, '');
    const nome = apt.customer_name || 'Cliente';
    return { phone, nome };
}

/**
 * Extrai horário do agendamento, compatível com ambos os schemas
 */
function extractTime(apt: any, schema: string): string {
    if (schema === 'client_join') {
        // start_at é texto ISO: "2026-10-29T14:00:00" ou "2026-10-29 14:00:00"
        if (!apt.start_at) return 'horário marcado';
        const timePart = apt.start_at.includes('T')
            ? apt.start_at.split('T')[1]
            : apt.start_at.split(' ')[1];
        return timePart ? timePart.substring(0, 5) : 'horário marcado'; // "14:00"
    }
    return apt.time || 'horário marcado';
}

/**
 * Busca agendamentos que precisam de lembrete e envia via WhatsApp
 */
async function checkAndSendReminders(ctx: ReminderContext) {
    const { config, supabase, sendWhatsApp } = ctx;
    const prefix = `[🔔 ${config.id}]`;
    const schema = (config as any).reminderSchema || 'inline';

    try {
        const now = new Date();

        // ===== LEMBRETE 24H =====
        if (config.reminder24h) {
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            const tomorrowDate = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

            let query24h;
            if (schema === 'client_join') {
                query24h = supabase
                    .from('appointments')
                    .select('id, start_at, clients(name, phone), services(name)')
                    .like('start_at', `${tomorrowDate}%`)
                    .not('status', 'in', '("cancelado","cancelled","concluido","completed","falta","no_show")')
                    .or('reminder_24h_sent.is.null,reminder_24h_sent.eq.false');
            } else {
                query24h = supabase
                    .from('appointments')
                    .select('id, customer_whatsapp, customer_name, time, services(name)')
                    .eq('date', tomorrowDate)
                    .in('status', ['pendente', 'confirmado'])
                    .or('reminder_24h_sent.is.null,reminder_24h_sent.eq.false');
            }

            const { data: appointments24h, error: err24 } = await query24h;

            if (err24) {
                console.error(`${prefix} Erro ao buscar lembretes 24h:`, err24.message);
            } else if (appointments24h && appointments24h.length > 0) {
                console.log(`${prefix} 📨 ${appointments24h.length} lembretes de 24h para enviar`);

                for (const apt of appointments24h) {
                    try {
                        const { phone, nome: nomeCliente } = extractContactInfo(apt, schema);
                        if (!phone) continue;

                        const serviceName = (apt as any).services?.name || 'seu procedimento';
                        const hora = extractTime(apt, schema);

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
            const todayDate = now.toISOString().split('T')[0];
            const in1h = new Date(now.getTime() + 60 * 60 * 1000);
            const in1h15 = new Date(now.getTime() + 75 * 60 * 1000);

            let query1h;
            if (schema === 'client_join') {
                // Filtra por start_at entre agora+1h e agora+1h15
                const from = in1h.toISOString().substring(0, 16);   // "2026-10-29T14:00"
                const to   = in1h15.toISOString().substring(0, 16); // "2026-10-29T14:15"
                query1h = supabase
                    .from('appointments')
                    .select('id, start_at, clients(name, phone), services(name)')
                    .gte('start_at', from)
                    .lte('start_at', to)
                    .not('status', 'in', '("cancelado","cancelled","concluido","completed","falta","no_show")')
                    .or('reminder_1h_sent.is.null,reminder_1h_sent.eq.false');
            } else {
                query1h = supabase
                    .from('appointments')
                    .select('id, customer_whatsapp, customer_name, time, services(name)')
                    .eq('date', todayDate)
                    .in('status', ['pendente', 'confirmado'])
                    .or('reminder_1h_sent.is.null,reminder_1h_sent.eq.false');
            }

            const { data: appointments1h, error: err1 } = await query1h;

            if (err1) {
                console.error(`${prefix} Erro ao buscar lembretes 1h:`, err1.message);
            } else if (appointments1h && appointments1h.length > 0) {
                console.log(`${prefix} 📨 ${appointments1h.length} lembretes de 1h para enviar`);

                for (const apt of appointments1h) {
                    try {
                        const { phone, nome: nomeCliente } = extractContactInfo(apt, schema);
                        if (!phone) continue;

                        // Para schema inline, filtra manualmente pela janela de 1h
                        if (schema === 'inline') {
                            const aptHora = apt.time || '';
                            const aptDate = `${todayDate}T${aptHora}:00`;
                            const aptTime = new Date(aptDate).getTime();
                            if (aptTime < in1h.getTime() || aptTime > in1h15.getTime()) continue;
                        }

                        const serviceName = (apt as any).services?.name || 'seu procedimento';
                        const hora = extractTime(apt, schema);
                        const jid = `${phone}@s.whatsapp.net`;

                        const vars = {
                            cliente: nomeCliente,
                            nome: nomeCliente,
                            empresa: config.name,
                            servico: serviceName,
                            hora: hora
                        };

                        const text = formatMsg(config.messages?.reminder1h ||
                            `🚨 *LEMBRETE — FALTA 1 HORA!*\n\n${SEPARATOR}\n\nOi, *{NOME}*! ⏳\n\nSeu agendamento na *{EMPRESA}* começa em *1 hora*!\n\n✂️ *Serviço:* {SERVICO}\n\n${SEPARATOR}\n\n📍 Chegue com alguns minutinhos de antecedência.\n_Te esperamos! ✨_`,
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
            const resolvedJid = await resolveJid(sock, jid);
            if ((sock as any).sendWithTyping) {
                await (sock as any).sendWithTyping(resolvedJid, { text: text });
            } else {
                await sock.sendMessage(resolvedJid, { text: text });
            }
        } else {
            throw new Error('WhatsApp não conectado');
        }
    };

    const ctx: ReminderContext = { config, supabase, sendWhatsApp };
    const schema = (config as any).reminderSchema || 'inline';

    console.log(`[🔔 ${config.id}] ✅ Sistema de lembretes ATIVADO | Schema: ${schema} | 24h: ${config.reminder24h ? '✅' : '❌'} | 1h: ${config.reminder1h ? '✅' : '❌'}`);

    // Roda imediatamente na primeira vez
    checkAndSendReminders(ctx);

    // Loop a cada 5 minutos
    const interval = setInterval(() => checkAndSendReminders(ctx), 5 * 60 * 1000);

    return interval;
}
