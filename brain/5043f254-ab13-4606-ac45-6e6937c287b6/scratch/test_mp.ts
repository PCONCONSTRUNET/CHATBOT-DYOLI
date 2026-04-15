import 'dotenv/config';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
const client = new MercadoPagoConfig({ accessToken: mpAccessToken });
const payment = new Payment(client);

async function testMP() {
    console.log('--- TESTE DE CONEXÃO MERCADO PAGO ---');
    console.log('Token utilizado:', mpAccessToken.substring(0, 15) + '...');
    
    try {
        const response = await payment.create({
            body: {
                transaction_amount: 1.00,
                description: 'Teste Chatbot PIX',
                payment_method_id: 'pix',
                payer: {
                    email: 'teste@exemplo.com',
                }
            }
        });
        console.log('✅ SUCESSO! PIX Gerado:', response.point_of_interaction?.transaction_data?.qr_code);
    } catch (error: any) {
        console.error('❌ ERRO NA API:');
        console.log('Status:', error.status);
        console.log('Mensagem:', error.message);
        console.log('Causa:', JSON.stringify(error.cause, null, 2));
    }
}

testMP();
