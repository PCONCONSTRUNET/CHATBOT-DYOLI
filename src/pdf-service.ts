const PDFDocument = require('pdfkit');
import { createClient } from '@supabase/supabase-js';

export async function generateAnamnesisPDF(data: {
    clientName: string,
    phone: string,
    cpf: string,
    service: string,
    anamneseText: string,
    healthOptions: {
        gravidez: boolean,
        cardiopatia: boolean,
        diabetes: boolean,
        circulatorio: boolean,
        respiratorio: boolean,
        asma: boolean,
        depressao: boolean,
        cancer: boolean,
        periodoMenstrual: boolean,
        coagulacao: boolean,
        herpes: boolean,
        infectoContagiosas: boolean
    },
    instanceName: string
}) {
    return new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ 
            margin: 40,
            size: 'A4'
        });
        const chunks: any[] = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const drawCheckbox = (label: string, checked: boolean, x: number, y: number) => {
            doc.rect(x, y - 2, 10, 10).stroke();
            if (checked) {
                doc.fontSize(10).text('X', x + 1.5, y - 1);
            }
            doc.fontSize(9).font('Helvetica').text(label, x + 15, y);
        };

        // --- HEADER ---
        doc.fontSize(22).font('Helvetica-Bold').text('FICHA DE ANAMNESE', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica').text(`Estúdio: ${data.instanceName}`, { align: 'center' });
        doc.moveDown(1);

        // --- CLIENT INFO SECTION ---
        const startY = doc.y;
        doc.fontSize(10);
        
        // Row 1
        doc.font('Helvetica-Bold').text('NOME: ', 40, startY, { continued: true }).font('Helvetica').text(data.clientName.toUpperCase());
        doc.font('Helvetica-Bold').text('FONE: ', 350, startY, { continued: true }).font('Helvetica').text(data.phone);
        
        // Row 2
        doc.moveDown(0.8);
        const row2Y = doc.y;
        doc.font('Helvetica-Bold').text('CPF: ', 40, row2Y, { continued: true }).font('Helvetica').text(data.cpf);
        doc.font('Helvetica-Bold').text('DATA: ', 350, row2Y, { continued: true }).font('Helvetica').text(new Date().toLocaleDateString('pt-BR'));

        // Row 3 (Procedimento e Categorias)
        doc.moveDown(0.8);
        const row3Y = doc.y;
        doc.font('Helvetica-Bold').text('PROCEDIMENTO: ', 40, row3Y, { continued: true }).font('Helvetica').text(data.service.toUpperCase());

        doc.moveDown(1.2);
        const catY = doc.y;
        const isTattoo = data.service.toLowerCase().includes('tattoo') || data.service.toLowerCase().includes('tatuagem');
        const isPiercing = data.service.toLowerCase().includes('piercing');
        const isMicro = data.service.toLowerCase().includes('micro');

        drawCheckbox('PIERCING', isPiercing, 40, catY);
        drawCheckbox('TATTOO', isTattoo, 140, catY);
        drawCheckbox('MICROPIGMENTAÇÃO', isMicro, 240, catY);

        doc.moveDown(1.5);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(1);

        // --- HEALTH OPTIONS (CHECKBOXES) ---
        doc.fontSize(11).font('Helvetica-Bold').text('CONDIÇÕES DE SAÚDE:');
        doc.moveDown(0.8);

        let cbY = doc.y;
        const col1 = 50, col2 = 180, col3 = 310, col4 = 440;

        // Line 1
        drawCheckbox('Gravidez', data.healthOptions.gravidez, col1, cbY);
        drawCheckbox('Cardiopatia', data.healthOptions.cardiopatia, col2, cbY);
        drawCheckbox('Diabetes', data.healthOptions.diabetes, col3, cbY);
        drawCheckbox('Circulatório', data.healthOptions.circulatorio, col4, cbY);

        // Line 2
        cbY += 20;
        drawCheckbox('Respiratório', data.healthOptions.respiratorio, col1, cbY);
        drawCheckbox('Asma', data.healthOptions.asma, col2, cbY);
        drawCheckbox('Depressão', data.healthOptions.depressao, col3, cbY);
        drawCheckbox('Câncer', data.healthOptions.cancer, col4, cbY);

        // Line 3
        cbY += 20;
        drawCheckbox('Menstrual', data.healthOptions.periodoMenstrual, col1, cbY);
        drawCheckbox('Coagulação', data.healthOptions.coagulacao, col2, cbY);
        drawCheckbox('Herpes', data.healthOptions.herpes, col3, cbY);
        drawCheckbox('Infecto C.', data.healthOptions.infectoContagiosas, col4, cbY);

        doc.moveDown(3);

        // --- DETAILED ANSWERS ---
        doc.fontSize(11).font('Helvetica-Bold').text('OBSERVAÇÕES / RESPOSTAS DETALHADAS:');
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').text(data.anamneseText || 'Nenhuma observação adicional.', { align: 'justify', lineGap: 3 });

        doc.moveDown(2);

        // --- DECLARATION ---
        doc.moveDown(1);
        doc.fontSize(9).font('Helvetica-Bold').text('DECLARAÇÃO DE CIÊNCIA E RESPONSABILIDADE:');
        doc.moveDown(0.3);
        doc.fontSize(8).font('Helvetica').text(
            'Autorizo a realização do procedimento. Recebi todas as recomendações pré e pós procedimento, e estou ciente de minhas condições de saúde física e psicológica. ' +
            'Não me enquadro na lista de risco descrito pela profissional Dyoli Godim durante a primeira consulta, ficando assim, a profissional isenta de qualquer responsabilidade quanto às reações que por ventura eu venha a apresentar. ' +
            'ASSUMO TOTAL RESPONSABILIDADE DE PÓS PROCEDIMENTO POIS SEGUIREI AS INSTRUÇÕES RECEBIDAS PELA PROFISSIONAL CORRETAMENTE.',
            { align: 'justify' }
        );

        doc.moveDown(1.5);
        
        // Autorizações específicas
        const authY = doc.y;
        drawCheckbox('Renuncio por vontade própria fazer o teste de sensibilidade?', false, 40, authY);
        doc.fontSize(8).text('SIM   /   NÃO', 310, authY);
        
        doc.moveDown(0.5);
        const photoY = doc.y;
        drawCheckbox('Autorizo que fotografe o procedimento para fins de portfólio?', true, 40, photoY);
        doc.fontSize(8).text('SIM   /   NÃO', 310, photoY);

        doc.moveDown(2);
        doc.fontSize(9).font('Helvetica-Bold').text(`Eu, ${data.clientName.toUpperCase()}, declaro para devidos fins e efeitos legais que são verdadeiras as informações acima e confirmo o meu desejo de executar o procedimento.`);

        doc.moveDown(4);

        // --- SIGNATURES ---
        const sigY = doc.y;
        doc.moveTo(60, sigY).lineTo(260, sigY).stroke();
        doc.fontSize(9).text('Assinatura do Cliente', 60, sigY + 5, { width: 200, align: 'center' });

        doc.moveTo(335, sigY).lineTo(535, sigY).stroke();
        doc.fontSize(9).text('Assinatura do Profissional', 335, sigY + 5, { width: 200, align: 'center' });

        // Footer
        doc.fontSize(7).fillColor('#999').text(`Documento gerado eletronicamente via P-CON BOT em ${new Date().toLocaleString('pt-BR')}`, 40, 780, { align: 'center' });

        doc.end();
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
