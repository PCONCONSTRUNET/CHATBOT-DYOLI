import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import type { InstanceConfig } from './config.js';

/**
 * Cria os clientes de pagamento para uma instância específica.
 * Cada empresa pode ter suas próprias credenciais de Mistic Pay e MercadoPago.
 */
export function createPaymentClients(config: InstanceConfig) {

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
                ...(external_reference ? { external_reference } : {}),
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
                ...(external_reference ? { external_reference } : {}),
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
        criarPagamentoPix,
        criarLinkCartao,
        consultarPagamento,
        hasMercadoPago: !!config.mercadopagoAccessToken,
    };
}
