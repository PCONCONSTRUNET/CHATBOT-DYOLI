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

            doc.on('data', (chunk: any) => chunks.push(chunk));
            doc.on('end', () => {
                console.log('[📄 PDF] Documento finalizado com sucesso.');
                resolve(Buffer.concat(chunks));
            });
            doc.on('error', (err: any) => {
                console.error('[📄 PDF] Erro interno do PDFKit:', err);
                reject(err);
            });

            const drawLeftCheckbox = (label: string, checked: boolean, boxX: number, y: number) => {
                doc.rect(boxX, y, 12, 12).stroke();
                if (checked) {
                    doc.fontSize(10).font('Helvetica-Bold').text('X', boxX + 3, y + 2);
                }
                if (label) {
                    doc.fontSize(9).font('Helvetica').text(label, boxX + 18, y + 3);
                }
            };

            const drawRightCheckbox = (label: string, checked: boolean, textX: number, y: number) => {
                doc.fontSize(9).font('Helvetica').text(label, textX, y + 3);
                const textWidth = doc.widthOfString(label);
                const boxX = textX + textWidth + 5;
                doc.rect(boxX, y, 12, 12).stroke();
                if (checked) {
                    doc.fontSize(10).font('Helvetica-Bold').text('X', boxX + 3, y + 2);
                }
            };

            const drawLine = (x1: number, y1: number, x2: number) => {
                doc.moveTo(x1, y1).lineTo(x2, y1).stroke();
            };

            // --- HEADER ---
            doc.fontSize(20).font('Helvetica-Bold').text('FICHA DE ANAMNESE', { align: 'center' });
            
            let currentY = 80;
            console.log('[📄 PDF] Desenhando cabeçalho e dados básicos...');

            // Linha 1: NOME e FONE
            doc.fontSize(9).font('Helvetica').text('NOME:', 40, currentY + 3);
            drawLine(75, currentY + 12, 400);
            doc.font('Helvetica').text((data.clientName || '').toUpperCase(), 80, currentY + 3);
            
            doc.font('Helvetica').text('FONE:', 410, currentY + 3);
            drawLine(445, currentY + 12, 555);
            doc.font('Helvetica').text(data.phone || '', 450, currentY + 3);

            // Linha 2: D. NASCIMENTO, IDADE, CPF
            currentY += 25;
            doc.font('Helvetica').text('D. NASCIMENTO:', 40, currentY + 3);
            drawLine(120, currentY + 12, 210);
            doc.font('Helvetica').text('____/____/____', 130, currentY + 3);

            doc.font('Helvetica').text('IDADE:', 220, currentY + 3);
            drawLine(255, currentY + 12, 305);
            doc.font('Helvetica').text('ANOS', 310, currentY + 3);

            doc.font('Helvetica').text('CPF:', 360, currentY + 3);
            drawLine(385, currentY + 12, 555);
            doc.font('Helvetica').text(data.cpf || '', 390, currentY + 3);

            // Linha 3: Categorias e LOCAL
            currentY += 25;
            const serviceLower = (data.service || '').toLowerCase();
            const isTattoo = serviceLower.includes('tattoo') || serviceLower.includes('tatuagem');
            const isPiercing = serviceLower.includes('piercing');
            const isMicro = serviceLower.includes('micro');

            drawLeftCheckbox('PIERCING', isPiercing, 40, currentY);
            drawLeftCheckbox('TATTOO', isTattoo, 120, currentY);
            drawLeftCheckbox('MICROPIGMENTAÇÃO | LOCAL:', isMicro, 200, currentY);
            drawLine(355, currentY + 12, 555);

            // Linha 4: AGULHA, LOTE, VALIDADE
            currentY += 25;
            doc.font('Helvetica').text('AGULHA:', 40, currentY + 3);
            drawLine(85, currentY + 12, 200);

            doc.font('Helvetica').text('LOTE:', 210, currentY + 3);
            drawLine(245, currentY + 12, 380);

            doc.font('Helvetica').text('VALIDADE:', 390, currentY + 3);
            drawLine(445, currentY + 12, 555);

            // Linha 5: OUTRAS OBSERVAÇÕES
            currentY += 25;
            doc.font('Helvetica').text('OUTRAS OBSERVAÇÕES:', 40, currentY + 3);
            drawLine(160, currentY + 12, 555);

            // Separator line
            currentY += 20;
            drawLine(40, currentY, 555);

            // --- SEÇÃO DE SAÚDE ---
            currentY += 15;
            console.log('[📄 PDF] Desenhando seção de saúde...');
            
            const opts = data.healthOptions || {};
            
            drawRightCheckbox('GRAVIDEZ', !!opts.gravidez, 40, currentY);
            drawRightCheckbox('CARDIOPATIA', !!opts.cardiopatia, 120, currentY);
            drawRightCheckbox('DIABETES', !!opts.diabetes, 210, currentY);
            drawRightCheckbox('CIRCULATÓRIO', !!opts.circulatorio, 290, currentY);
            drawRightCheckbox('RESPIRATÓRIO', !!opts.respiratorio, 395, currentY);

            currentY += 22;
            drawRightCheckbox('ASMA', !!opts.asma, 40, currentY);
            drawRightCheckbox('DEPRESSÃO', !!opts.depressao, 120, currentY);
            drawRightCheckbox('CÂNCER', !!opts.cancer, 210, currentY);
            drawRightCheckbox('PERÍODO MENSTRUAL', !!opts.periodoMenstrual, 290, currentY);
            drawRightCheckbox('COAGULAÇÃO', !!opts.coagulacao, 415, currentY);

            currentY += 22;
            drawRightCheckbox('HERPES', !!opts.herpes, 180, currentY);
            drawRightCheckbox('INFECTO CONTAGIOSAS', !!opts.infectoContagiosas, 280, currentY);

            // --- DECLARAÇÃO ---
            currentY += 30;
            console.log('[📄 PDF] Desenhando termos e assinaturas...');
            doc.fontSize(10).font('Helvetica-Bold').text('DECLARAÇÃO DE CIÊNCIA:', 40, currentY, { align: 'center' });
            currentY = doc.y + 5;

            doc.fontSize(8.5).font('Helvetica').text(
                'Autorizo a realização do procedimento de TATUAGEM, PIERCING OU MICROPIGMENTAÇÃO.\n' +
                'Recebi recomendações pré e pós procedimento, e estou ciente de minhas condições de saúde física e psicológica.\n' +
                'Não me enquadro na lista de risco descrito pela profissional Dyoli Godim durante a primeira consulta, ficando assim, a\n' +
                'profissional isento de qualquer responsabilidade quanto às reações que por ventura eu venha a apresentar.',
                40, currentY, { width: 515, align: 'center', lineGap: 2 }
            );
            
            currentY = doc.y + 5;
            doc.font('Helvetica-Bold').text(
                'ASSUMO TOTAL RESPONSABILIDADE DE PÓS PROCEDIMENTO POIS SEGUIREI AS INSTRUÇÕES RECEBIDAS\n' +
                'PELA PROFISSIONAL CORRETAMENTE.',
                40, currentY, { width: 515, align: 'center', lineGap: 2 }
            );

            currentY = doc.y + 15;
            doc.fontSize(9).font('Helvetica').text('Renuncio por vontade própria de fazer o teste de sensibilidade SIM', 110, currentY + 3);
            let wSim = doc.widthOfString('Renuncio por vontade própria de fazer o teste de sensibilidade SIM');
            let boxSimX = 110 + wSim + 5;
            doc.rect(boxSimX, currentY, 12, 12).stroke();
            
            doc.text('NÃO', boxSimX + 20, currentY + 3);
            let wNao = doc.widthOfString('NÃO');
            doc.rect(boxSimX + 20 + wNao + 5, currentY, 12, 12).stroke();

            currentY = doc.y + 20;
            doc.text(
                'Estando ciente que por esse ato assumo qualquer responsabilidade no que diz respeito a reação que minha pele possa\n' +
                'vir a sofrer. A PROFISSIONAL NÃO SERÁ RESPONSÁVEL POR POSSÍVEL NEGLIGÊNCIA DE MINHA PARTE.',
                40, currentY, { width: 515, align: 'center', lineGap: 2 }
            );

            currentY = doc.y + 10;
            doc.text('Autorizo que fotografe SIM', 70, currentY + 3);
            let wFotoSim = doc.widthOfString('Autorizo que fotografe SIM');
            doc.rect(70 + wFotoSim + 5, currentY, 12, 12).stroke();
            
            doc.text('NÃO', 70 + wFotoSim + 25, currentY + 3);
            let wFotoNao = doc.widthOfString('NÃO');
            doc.rect(70 + wFotoSim + 25 + wFotoNao + 5, currentY, 12, 12).stroke();
            
            doc.text('o procedimento para efeitos de documentação, congressos e divulgações.', 70 + wFotoSim + 25 + wFotoNao + 25, currentY + 3);

            currentY = doc.y + 25;
            doc.font('Helvetica-Bold');
            doc.text('Eu ', 40, currentY);
            let wEu = doc.widthOfString('Eu ');
            drawLine(40 + wEu + 5, currentY + 8, 350);
            doc.text((data.clientName || '').toUpperCase(), 40 + wEu + 10, currentY - 1);
            doc.text(' declaro para devidos fins e efeitos legais que', 350, currentY);
            currentY = doc.y + 5;
            doc.text('são verdadeiras as informações acima e confirmo o meu desejo de executar o procedimento.', 40, currentY);

            // Separator line
            currentY = doc.y + 20;
            drawLine(40, currentY, 555);

            // --- MENORES DE IDADE ---
            currentY += 20;
            doc.font('Helvetica-Bold').text('MENORES DE IDADE:', 40, currentY);
            currentY = doc.y + 5;

            const menorText = 'Eu _______________________________________________________ responsável legal portador (a) do RG ____________________ e do CPF ____________________ estou em sã consciência dos riscos e autorizo a profissional Dyoli Godim a executar sobre o corpo de meu filho (a) __________________________________________________ menor de idade, portador do RG ____________________ e do CPF ____________________ que em minha companhia reside e pelo qual sou inteiramente responsável pelo procedimento. Assumo ainda plena responsabilidade eximindo de qualquer responsabilidade criminal e/ou cível o profissional executor deste procedimento.';

            doc.font('Helvetica').text(menorText, 40, currentY, { width: 515, align: 'justify', lineGap: 3 });

            currentY = doc.y + 15;
            doc.text('Declaro para devidos fins e efeitos legais que são verdadeiras as informações acima e confirmo o meu desejo de executar o procedimento.', 40, currentY, { width: 515, align: 'justify' });

            // --- ASSINATURAS ---
            currentY = doc.y + 40;
            drawLine(80, currentY, 260);
            doc.fontSize(9).text('Assinatura do Cliente', 80, currentY + 5, { width: 180, align: 'center' });

            drawLine(330, currentY, 510);
            doc.fontSize(9).text('Assinatura do Responsável', 330, currentY + 5, { width: 180, align: 'center' });

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
