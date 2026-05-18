
export const SEPARATOR = '━━━━━━━━━━━━━━━━━━━━';


export const formatMsg = (template: string, vars: any = {}) => {
    let res = template;
    Object.keys(vars).forEach(key => {
        // Suporta {key} e {KEY}
        res = res.replace(new RegExp(`{${key}}`, 'g'), vars[key]);
        res = res.replace(new RegExp(`{${key.toUpperCase()}}`, 'g'), vars[key]);
    });
    return res;
};

/**
 * Normaliza um número de telefone para um JID válido do WhatsApp.
 * Remove o 9º dígito para números brasileiros com DDD >= 31, se presente.
 */
export function formatJid(phone: string): string {
    if (!phone) return '';
    let clean = phone.replace(/\D/g, '');
    
    // Adiciona o DDI brasileiro (55) se tiver apenas DDD + número (10 ou 11 dígitos)
    if (clean.length === 10 || clean.length === 11) {
        clean = '55' + clean;
    }
    
    // Se for um número brasileiro com 13 dígitos (55 + DDD + 9 dígitos)
    if (clean.startsWith('55') && clean.length === 13) {
        const ddd = parseInt(clean.substring(2, 4), 10);
        // Para DDDs >= 31, os JIDs do WhatsApp omitem o 9º dígito
        if (ddd >= 31) {
            clean = '55' + ddd + clean.substring(5);
        }
    }
    
    return clean.includes('@') ? clean : `${clean}@s.whatsapp.net`;
}

/**
 * Resolve o JID absolutamente correto usando o onWhatsApp do Baileys se possível,
 * caindo de volta para o JID formatado caso falhe ou o bot não esteja conectado.
 */
export async function resolveJid(sock: any, phone: string): Promise<string> {
    const fallback = formatJid(phone);
    if (!sock) return fallback;
    
    try {
        const resolved = await sock.onWhatsApp(fallback);
        if (resolved && resolved.length > 0 && resolved[0].exists) {
            return resolved[0].jid;
        }
    } catch (err: any) {
        console.warn(`[JID Resolver] Falha ao resolver JID via onWhatsApp para ${phone}:`, err.message || err);
    }
    return fallback;
}

