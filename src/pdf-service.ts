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
            doc.rect(x, y - 2, 12, 12).stroke();
            if (checked) {
                doc.fontSize(11).font('Helvetica-Bold').text('X', x + 2, y - 1);
            }
            doc.fontSize(9).font('Helvetica').text(label, x + 18, y + 1);
        };

        const drawLine = (x1: number, y1: number, x2: number) => {
            doc.moveTo(x1, y1).lineTo(x2, y1).stroke();
        };

        // --- HEADER ---
        doc.fontSize(24).font('Helvetica-Bold').text('FICHA DE ANAMNESE', { align: 'center' });
        doc.moveDown(1.5);

        let y = 80;
        doc.fontSize(10);
        
        // Linha 1: NOME e FONE
        doc.font('Helvetica-Bold').text('NOME:', 40, y);
        drawLine(85, y + 10, 420);
        doc.font('Helvetica').text(data.clientName.toUpperCase(), 90, y);
        
        doc.font('Helvetica-Bold').text('FONE:', 430, y);
        drawLine(470, y + 10, 555);
        doc.font('Helvetica').text(data.phone, 475, y);

        // Linha 2: D. NASCIMENTO, IDADE, CPF
        y += 25;
        doc.font('Helvetica-Bold').text('D. NASCIMENTO:', 40, y);
        drawLine(125, y + 10, 250);
        doc.font('Helvetica').text('____/____/____', 140, y);

        doc.font('Helvetica-Bold').text('IDADE:', 260, y);
        drawLine(305, y + 10, 360);
        doc.font('Helvetica-Bold').text('ANOS', 365, y);

        doc.font('Helvetica-Bold').text('CPF:', 410, y);
        drawLine(440, y + 10, 555);
        doc.font('Helvetica').text(data.cpf, 445, y);

        // Linha 3: Categorias e LOCAL
        y += 25;
        const isTattoo = data.service.toLowerCase().includes('tattoo') || data.service.toLowerCase().includes('tatuagem');
        const isPiercing = data.service.toLowerCase().includes('piercing');
        const isMicro = data.service.toLowerCase().includes('micro');

        drawCheckbox('PIERCING', isPiercing, 40, y);
        drawCheckbox('TATTOO', isTattoo, 120, y);
        drawCheckbox('MICROPIGMENTAÇÃO | LOCAL:', isMicro, 200, y);
        drawLine(360, y + 10, 555);

        // Linha 4: AGULHA, LOTE, VALIDADE
        y += 30;
        doc.font('Helvetica-Bold').text('AGULHA:', 40, y);
        drawLine(90, y + 10, 240);

        doc.font('Helvetica-Bold').text('LOTE:', 250, y);
        drawLine(285, y + 10, 420);

        doc.font('Helvetica-Bold').text('VALIDADE:', 430, y);
        drawLine(490, y + 10, 555);

        // Linha 5: OUTRAS OBSERVAÇÕES
        y += 25;
        doc.font('Helvetica-Bold').text('OUTRAS OBSERVAÇÕES:', 40, y);
        drawLine(165, y + 10, 555);
        y += 20;
        drawLine(40, y + 10, 555);

        // Divisor
        y += 25;
        drawLine(40, y, 555);

        // --- TABELA DE SAÚDE ---
        y += 15;
        const col1 = 40, col2 = 135, col3 = 235, col4 = 350, col5 = 460;
        
        // Linha 1 Saúde
        drawCheckbox('GRAVIDEZ', data.healthOptions.gravidez, col1, y);
        drawCheckbox('CARDIOPATIA', data.healthOptions.cardiopatia, col2, y);
        drawCheckbox('DIABETES', data.healthOptions.diabetes, col3, y);
        drawCheckbox('CIRCULATÓRIO', data.healthOptions.circulatorio, col4, y);
        drawCheckbox('RESPIRATÓRIO', data.healthOptions.respiratorio, col5, y);

        // Linha 2 Saúde
        y += 25;
        drawCheckbox('ASMA', data.healthOptions.asma, col1, y);
        drawCheckbox('DEPRESSÃO', data.healthOptions.depressao, col2, y);
        drawCheckbox('CÂNCER', data.healthOptions.cancer, col3, y);
        doc.font('Helvetica-Bold').text('PERÍODO MENSTRUAL', col4, y + 1);
        drawCheckbox('', data.healthOptions.periodoMenstrual, 475, y);
        drawCheckbox('COAGULAÇÃO', 505, y); // Label depois
        drawCheckbox('', data.healthOptions.coagulacao, col5 + 75, y);
        
        // Ajuste manual para alinhar com a foto (COAGULAÇÃO ficou apertado)
        // Vamos reorganizar as colunas para caber igual à foto
        y -= 25; // Volta pra linha 1
        y += 25; // Linha 2
        drawCheckbox('ASMA', data.healthOptions.asma, 40, y);
        drawCheckbox('DEPRESSÃO', data.healthOptions.depressao, 105, y);
        drawCheckbox('CÂNCER', data.healthOptions.cancer, 195, y);
        doc.font('Helvetica-Bold').text('PERÍODO MENSTRUAL', 270, y + 1);
        drawCheckbox('', data.healthOptions.periodoMenstrual, 385, y);
        doc.font('Helvetica-Bold').text('COAGULAÇÃO', 415, y + 1);
        drawCheckbox('', data.healthOptions.coagulacao, 500, y);

        // Linha 3 Saúde
        y += 25;
        drawCheckbox('HERPES', data.healthOptions.herpes, 230, y);
        drawCheckbox('INFECTO CONTAGIOSAS', data.healthOptions.infectoContagiosas, 310, y);

        // --- DECLARAÇÃO ---
        y += 35;
        doc.fontSize(11).font('Helvetica-Bold').text('DECLARAÇÃO DE CIÊNCIA:', { align: 'center' });
        y += 15;
        doc.fontSize(8.5).font('Helvetica').text(
            'Autorizo a realização do procedimento de TATUAGEM, PIERCING OU MICROPIGMENTAÇÃO. Recebi recomendações pré e pós procedimento, e estou ciente de minhas condições de saúde física e psicológica. Não me enquadro na lista de risco descrito pela profissional Dyoli Godim durante a primeira consulta, ficando assim, a profissional isento de qualquer responsabilidade quanto às reações que por ventura eu venha a apresentar. ASSUMO TOTAL RESPONSABILIDADE DE PÓS PROCEDIMENTO POIS SEGUIREI AS INSTRUÇÕES RECEBIDAS PELA PROFISSIONAL CORRETAMENTE.',
            40, y, { width: 515, align: 'center', lineGap: 2 }
        );

        y += 55;
        doc.fontSize(10).font('Helvetica').text('Renuncio por vontade própria de fazer o teste de sensibilidade  SIM', 130, y);
        drawCheckbox('', false, 450, y);
        doc.font('Helvetica').text('NÃO', 475, y);
        drawCheckbox('', true, 510, y);

        y += 25;
        doc.fontSize(9).font('Helvetica').text('Estando ciente que por esse ato assumo qualquer responsabilidade no que diz respeito a reação que minha pele possa vir a sofrer. A PROFISSIONAL NÃO SERÁ RESPONSÁVEL POR POSSÍVEL NEGLIGÊNCIA DE MINHA PARTE.', 40, y, { width: 515, align: 'center' });

        y += 25;
        doc.fontSize(10).font('Helvetica').text('Autorizo que fotografe SIM', 40, y);
        drawCheckbox('', true, 160, y);
        doc.font('Helvetica').text('NÃO', 185, y);
        drawCheckbox('', false, 220, y);
        doc.font('Helvetica').text('o procedimento para efeitos de documentação, congressos e divulgações.', 245, y);

        y += 30;
        doc.font('Helvetica').text('Eu __________________________________________________ declaro para devidos fins e efeitos legais que', 40, y);
        doc.font('Helvetica-Bold').text(data.clientName.toUpperCase(), 65, y - 2);
        y += 15;
        doc.font('Helvetica-Bold').text('são verdadeiras as informações acima e confirmo o meu desejo de executar o procedimento.', 40, y);

        y += 25;
        drawLine(40, y, 555);

        // --- MENORES DE IDADE ---
        y += 15;
        doc.fontSize(10).font('Helvetica-Bold').text('MENORES DE IDADE:', 40, y);
        y += 15;
        doc.fontSize(8.5).font('Helvetica').text(
            'Eu ____________________________________________________ responsável legal portador (a) do RG ____________________ e do CPF ___________________________ estou em sã consciência dos riscos e autorizo a profissional Dyoli Godim a executar sobre o corpo de meu filho (a) ________________________________________________ menor de idade, portador do RG ____________________ e do CPF ___________________________ que em minha companhia reside e pelo qual sou inteiramente responsável pelo procedimento. Assumo ainda plena responsabilidade eximindo de qualquer responsabilidade criminal e/ou cível o profissional executor deste procedimento.',
            40, y, { width: 515, align: 'justify', lineGap: 4 }
        );

        y += 85;
        drawLine(40, y, 555);
        y += 15;
        doc.fontSize(10).font('Helvetica').text('Declaro para devidos fins e efeitos legais que são verdadeiras as informações acima e confirmo o meu desejo de executar o procedimento.', 40, y, { width: 515 });

        // --- ASSINATURAS ---
        y += 60;
        drawLine(80, y, 260);
        doc.fontSize(9).text('Assinatura do Cliente', 80, y + 5, { width: 180, align: 'center' });

        drawLine(330, y, 510);
        doc.fontSize(9).text('Assinatura do Responsável', 330, y + 5, { width: 180, align: 'center' });

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
