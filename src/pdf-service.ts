import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');
import { createClient } from '@supabase/supabase-js';

export async function generateAnamnesisPDF(data: {
    clientName: string,
    phone: string,
    cpf: string,
    service: string,
    anamneseText: string,
    healthOptions: any,
    instanceName: string
}) {
    return new Promise<Buffer>((resolve, reject) => {
        try {
            console.log('[📄 PDF] Iniciando montagem do documento...');
            const doc = new PDFDocument({ 
                margin: 40,
                size: 'A4'
            });
            const chunks: any[] = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => {
                console.log('[📄 PDF] Documento finalizado com sucesso.');
                resolve(Buffer.concat(chunks));
            });
            doc.on('error', (err: any) => {
                console.error('[📄 PDF] Erro interno do PDFKit:', err);
                reject(err);
            });

            const drawCheckbox = (label: string, checked: boolean, x: number, y: number) => {
                doc.rect(Number(x), Number(y) - 2, 12, 12).stroke();
                if (checked) {
                    doc.fontSize(11).font('Helvetica-Bold').text('X', Number(x) + 2, Number(y) - 1);
                }
                if (label) {
                    doc.fontSize(9).font('Helvetica').text(label, Number(x) + 18, Number(y) + 1);
                }
            };

            const drawLine = (x1: number, y1: number, x2: number) => {
                doc.moveTo(Number(x1), Number(y1)).lineTo(Number(x2), Number(y1)).stroke();
            };

            // --- HEADER ---
            doc.fontSize(24).font('Helvetica-Bold').text('FICHA DE ANAMNESE', { align: 'center' });
            doc.moveDown(1);

            let currentY = 80;
            console.log('[📄 PDF] Desenhando cabeçalho e dados básicos...');

            // Linha 1: NOME e FONE
            doc.fontSize(10).font('Helvetica-Bold').text('NOME:', 40, currentY);
            drawLine(85, currentY + 10, 420);
            doc.font('Helvetica').text((data.clientName || 'Não informado').toUpperCase(), 90, currentY);
            
            doc.font('Helvetica-Bold').text('FONE:', 430, currentY);
            drawLine(470, currentY + 10, 555);
            doc.font('Helvetica').text(data.phone || '', 475, currentY);

            // Linha 2: D. NASCIMENTO, IDADE, CPF
            currentY += 25;
            doc.font('Helvetica-Bold').text('D. NASCIMENTO:', 40, currentY);
            drawLine(125, currentY + 10, 250);
            doc.font('Helvetica').text('____/____/____', 140, currentY);

            doc.font('Helvetica-Bold').text('IDADE:', 260, currentY);
            drawLine(305, currentY + 10, 360);
            doc.font('Helvetica-Bold').text('ANOS', 365, currentY);

            doc.font('Helvetica-Bold').text('CPF:', 410, currentY);
            drawLine(440, currentY + 10, 555);
            doc.font('Helvetica').text(data.cpf || '', 445, currentY);

            // Linha 3: Categorias e LOCAL
            currentY += 25;
            const serviceLower = (data.service || '').toLowerCase();
            const isTattoo = serviceLower.includes('tattoo') || serviceLower.includes('tatuagem');
            const isPiercing = serviceLower.includes('piercing');
            const isMicro = serviceLower.includes('micro');

            drawCheckbox('PIERCING', isPiercing, 40, currentY);
            drawCheckbox('TATTOO', isTattoo, 120, currentY);
            drawCheckbox('MICROPIGMENTAÇÃO | LOCAL:', isMicro, 200, currentY);
            drawLine(360, currentY + 10, 555);

            // Linha 4: AGULHA, LOTE, VALIDADE
            currentY += 30;
            doc.font('Helvetica-Bold').text('AGULHA:', 40, currentY);
            drawLine(90, currentY + 10, 240);

            doc.font('Helvetica-Bold').text('LOTE:', 250, currentY);
            drawLine(285, currentY + 10, 420);

            doc.font('Helvetica-Bold').text('VALIDADE:', 430, currentY);
            drawLine(490, currentY + 10, 555);

            // --- SEÇÃO DE SAÚDE ---
            currentY += 35;
            console.log('[📄 PDF] Desenhando seção de saúde...');
            doc.fontSize(11).font('Helvetica-Bold').text('SITUAÇÕES DE SAÚDE:', { align: 'center' });
            
            currentY += 20;
            const opts = data.healthOptions || {};
            drawCheckbox('GESTANTE / AMAMENTANDO', !!opts.gravidez, 40, currentY);
            drawCheckbox('CARDIOPATIA', !!opts.cardiopatia, 210, currentY);
            drawCheckbox('DIABETES', !!opts.diabetes, 310, currentY);

            currentY += 20;
            drawCheckbox('PROBLEMAS CIRCULATÓRIOS', !!opts.circulatorio, 40, currentY);
            drawCheckbox('PROBLEMAS RESPIRATÓRIOS', !!opts.respiratorio, 210, currentY);
            drawCheckbox('ASMA / BRONQUITE', !!opts.asma, 310, currentY);

            currentY += 20;
            drawCheckbox('DEPRESSÃO / ANSIEDADE', !!opts.depressao, 40, currentY);
            drawCheckbox('CÂNCER / TUMORES', !!opts.cancer, 210, currentY);
            drawCheckbox('PERÍODO MENSTRUAL', !!opts.periodoMenstrual, 310, currentY);

            currentY += 20;
            drawCheckbox('PROBLEMAS DE COAGULAÇÃO', !!opts.coagulacao, 40, currentY);
            drawCheckbox('HERPES (LABIAL)', !!opts.herpes, 210, currentY);
            drawCheckbox('INFECTO CONTAGIOSAS', !!opts.infectoContagiosas, 310, currentY);

            // --- DECLARAÇÃO ---
            currentY += 35;
            console.log('[📄 PDF] Desenhando termos e assinaturas...');
            doc.fontSize(11).font('Helvetica-Bold').text('DECLARAÇÃO DE CIÊNCIA:', { align: 'center' });
            currentY += 15;
            doc.fontSize(8.5).font('Helvetica').text(
                'Autorizo a realização do procedimento. Recebi recomendações pré e pós procedimento, e estou ciente de minhas condições de saúde física e psicológica. Não me enquadro na lista de risco descrito pela profissional Dyoli Godim, ficando a profissional isenta de qualquer responsabilidade quanto às reações que por ventura eu venha a apresentar. ASSUMO TOTAL RESPONSABILIDADE.',
                40, currentY, { width: 515, align: 'center', lineGap: 2 }
            );

            currentY += 50;
            doc.fontSize(10).font('Helvetica').text('Renuncio o teste de sensibilidade: SIM', 130, currentY);
            drawCheckbox('', false, 320, currentY);
            doc.text('NÃO', 345, currentY);
            drawCheckbox('', true, 380, currentY);

            currentY += 30;
            doc.text('Autorizo fotografar o procedimento: SIM', 130, currentY);
            drawCheckbox('', true, 330, currentY);
            doc.text('NÃO', 355, currentY);
            drawCheckbox('', false, 390, currentY);

            currentY += 35;
            doc.font('Helvetica').text(`Eu ${data.clientName.toUpperCase()} declaro que as informações acima são verdadeiras.`, 40, currentY, { align: 'center' });

            // --- ASSINATURAS ---
            currentY += 60;
            drawLine(80, currentY, 260);
            doc.fontSize(9).text('Assinatura do Cliente', 80, currentY + 5, { width: 180, align: 'center' });

            drawLine(330, currentY, 510);
            doc.fontSize(9).text('Assinatura do Responsável', 330, currentY + 5, { width: 180, align: 'center' });

            // Footer
            doc.fontSize(7).fillColor('#999').text(`Documento gerado em ${new Date().toLocaleString('pt-BR')}`, 40, 780, { align: 'center' });

            doc.end();
        } catch (err) {
            console.error('[📄 PDF] Erro crítico durante a geração:', err);
            reject(err);
        }
    });
}

export async function uploadAnamnesis(buffer: Buffer, filename: string, supabase: any) {
    const { data, error } = await supabase.storage
        .from('anamnesis')
        .upload(filename, buffer, {
            contentType: 'application/pdf',
            upsert: true
        });

    if (error) {
        console.error('[PDF] Erro ao fazer upload:', error.message);
        throw error;
    }

    const { data: { publicUrl } } = supabase.storage
        .from('anamnesis')
        .getPublicUrl(filename);

    return publicUrl;
}
