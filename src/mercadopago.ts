import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import 'dotenv/config';

const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || '' });

// Create a PIX payment directly
export const criarPagamentoPix = async (valor: number, email: string, descricao: string, external_reference?: string) => {
    const payment = new Payment(client);
    try {
        const resposta = await payment.create({
            body: {
                transaction_amount: Number(valor),
                description: descricao,
                payment_method_id: 'pix',
                ...(external_reference ? { external_reference } : {}),
                payer: {
                    email: email,
                }
            }
        });
        
        return {
            id: resposta.id,
            qr_code: resposta.point_of_interaction?.transaction_data?.qr_code,
            qr_code_base64: resposta.point_of_interaction?.transaction_data?.qr_code_base64,
            ticket_url: resposta.point_of_interaction?.transaction_data?.ticket_url,
        };
    } catch (error) {
        console.error("Erro ao criar PIX:", error);
        throw error;
    }
};

// Create a Checkout link for Credit Card
export const criarLinkCartao = async (valor: number, titulo: string, external_reference?: string) => {
    const preference = new Preference(client);
    try {
        const resposta = await preference.create({
            body: {
                ...(external_reference ? { external_reference } : {}),
                items: [
                    {
                        id: 'ass',
                        title: titulo,
                        quantity: 1,
                        unit_price: Number(valor),
                    }
                ],
                payment_methods: {
                    excluded_payment_types: [
                        { id: 'ticket' }, // exclude boleto
                        { id: 'bank_transfer' } // exclude pix here so they only use card
                    ],
                    installments: 12
                }
            }
        });

        return {
            id: resposta.id,
            init_point: resposta.init_point // URL do checkout
        };
    } catch (error) {
        console.error("Erro ao criar link de cartao:", error);
        throw error;
    }
};

export const consultarPagamento = async (id: number | string) => {
    const payment = new Payment(client);
    try {
        return await payment.get({ id: Number(id) });
    } catch (error) {
        console.error("Erro ao consultar pagamento:", error);
        throw error;
    }
};
