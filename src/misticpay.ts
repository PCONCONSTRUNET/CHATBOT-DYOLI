import 'dotenv/config';

const MISTIC_CLIENT_ID = process.env.MISTIC_CLIENT_ID || '';
const MISTIC_CLIENT_SECRET = process.env.MISTIC_CLIENT_SECRET || '';
const BASE = 'https://api.misticpay.com/api';

const headers = () => ({
    'ci': MISTIC_CLIENT_ID,
    'cs': MISTIC_CLIENT_SECRET,
    'Content-Type': 'application/json',
});

// Cria uma cobrança PIX (cash in)
export const criarPagamentoPixMistic = async (opts: {
    valor: number;          // em reais. Ex: 4.55 = R$ 4,55
    payerName: string;      // Nome do pagador
    payerDocument: string;  // CPF sem formatação
    transactionId: string;  // ID único para rastrear (usamos o num do WhatsApp)
    description: string;
    webhookUrl?: string;
}) => {
    const res = await fetch(`${BASE}/transactions/create`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
            amount: opts.valor,
            payerName: opts.payerName,
            payerDocument: opts.payerDocument,
            transactionId: opts.transactionId,
            description: opts.description,
            projectWebhook: opts.webhookUrl,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Mistic Pay API Error ${res.status}: ${err}`);
    }

    const body = await res.json() as any;
    const data = body.data;

    return {
        id: data.transactionId,
        copy_paste: data.copyPaste,         // Código PIX Copia e Cola
        qr_base64: data.qrCodeBase64,       // QR Code em base64
        qr_url: data.qrcodeUrl,             // URL da imagem QR
        valor: data.transactionAmount / 100, // Em reais (vem em centavos)
        status: data.transactionState,
    };
};

// Verifica status de uma transação existente
export const verificarPagamentoMistic = async (transactionId: string | number) => {
    const res = await fetch(`${BASE}/transactions/check`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ transactionId: String(transactionId) }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Mistic Pay check error ${res.status}: ${err}`);
    }

    const body = await res.json() as any;
    return body.transaction;
};
