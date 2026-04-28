import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import type { InstanceConfig } from './config.js';

/**
 * Cria os clientes de pagamento para uma instância específica.
 * Cada empresa pode ter suas próprias credenciais de Mistic Pay e MercadoPago.
 */
export function createPaymentClients(config: InstanceConfig) {

    // ================== MISTIC PAY ==================
    const MISTIC_BASE = 'https://api.misticpay.com/api';

    const misticHeaders = () => ({
        'ci': config.misticClientId || '',
        'cs': config.misticClientSecret || '',
        'Content-Type': 'application/json',
    });

    const criarPagamentoPixMistic = async (opts: {
        valor: number;
        payerName: string;
        payerDocument: string;
        transactionId: string;
        description: string;
        webhookUrl?: string;
    }) => {
        if (!config.misticClientId || !config.misticClientSecret) {
            throw new Error(`[${config.id}] Mistic Pay não configurado`);
        }

        const res = await fetch(`${MISTIC_BASE}/transactions/create`, {
            method: 'POST',
            headers: misticHeaders(),
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
            copy_paste: data.copyPaste,
            qr_base64: data.qrCodeBase64,
            qr_url: data.qrcodeUrl,
            valor: data.transactionAmount / 100,
            status: data.transactionState,
        };
    };

    const verificarPagamentoMistic = async (transactionId: string | number) => {
        const res = await fetch(`${MISTIC_BASE}/transactions/check`, {
            method: 'POST',
            headers: misticHeaders(),
            body: JSON.stringify({ transactionId: String(transactionId) }),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Mistic Pay check error ${res.status}: ${err}`);
        }

        const body = await res.json() as any;
        return body.transaction;
    };

    // ================== MERCADO PAGO ==================
    let mpClient: MercadoPagoConfig | null = null;
    if (config.mercadopagoAccessToken) {
        mpClient = new MercadoPagoConfig({ accessToken: config.mercadopagoAccessToken });
    }

    const criarPagamentoPix = async (valor: number, email: string, descricao: string, external_reference?: string) => {
        if (!mpClient) throw new Error(`[${config.id}] MercadoPago não configurado`);
        const payment = new Payment(mpClient);
        const resposta = await payment.create({
            body: {
                transaction_amount: Number(valor),
                description: descricao,
                payment_method_id: 'pix',
                external_reference,
                payer: { email },
            }
        });
        return {
            id: resposta.id,
            qr_code: resposta.point_of_interaction?.transaction_data?.qr_code,
            qr_code_base64: resposta.point_of_interaction?.transaction_data?.qr_code_base64,
            ticket_url: resposta.point_of_interaction?.transaction_data?.ticket_url,
        };
    };

    const criarLinkCartao = async (valor: number, titulo: string, external_reference?: string) => {
        if (!mpClient) throw new Error(`[${config.id}] MercadoPago não configurado`);
        const preference = new Preference(mpClient);
        const resposta = await preference.create({
            body: {
                external_reference,
                items: [{
                    id: 'ass',
                    title: titulo,
                    quantity: 1,
                    unit_price: Number(valor),
                }],
                payment_methods: {
                    excluded_payment_types: [
                        { id: 'ticket' },
                        { id: 'bank_transfer' }
                    ],
                    installments: 12
                }
            }
        });
        return {
            id: resposta.id,
            init_point: resposta.init_point,
        };
    };

    const consultarPagamento = async (id: number | string) => {
        if (!mpClient) throw new Error(`[${config.id}] MercadoPago não configurado`);
        const payment = new Payment(mpClient);
        return await payment.get({ id: Number(id) });
    };

    return {
        criarPagamentoPixMistic,
        verificarPagamentoMistic,
        criarPagamentoPix,
        criarLinkCartao,
        consultarPagamento,
        hasMistic: !!(config.misticClientId && config.misticClientSecret),
        hasMercadoPago: !!config.mercadopagoAccessToken,
    };
}
