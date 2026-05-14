import PDFDocument from 'pdfkit';
import { createClient } from '@supabase/supabase-js';

export async function generateAnamnesisPDF(data: {
    clientName: string,
    phone: string,
    service: string,
    anamnese: string,
    instanceName: string
}) {
    return new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const chunks: any[] = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        doc.fontSize(22).text('FICHA DE ANAMNESE', { align: 'center' });
        doc.moveDown();
        doc.fontSize(14).text(`Estúdio: ${data.instanceName}`, { align: 'center' });
        doc.moveDown(2);

        // Client Info
        doc.fontSize(12).fillColor('#333');
        doc.text(`NOME DO CLIENTE: `, { continued: true }).fillColor('#000').text(data.clientName);
        doc.fillColor('#333').text(`WHATSAPP: `, { continued: true }).fillColor('#000').text(data.phone);
        doc.fillColor('#333').text(`DATA: `, { continued: true }).fillColor('#000').text(new Date().toLocaleDateString('pt-BR'));
        doc.fillColor('#333').text(`PROCEDIMENTO: `, { continued: true }).fillColor('#000').text(data.service);
        doc.moveDown();
        
        // Line
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // Anamnese Content
        doc.fontSize(14).fillColor('#000').text('RESPOSTAS DA ANAMNESE:', { underline: true });
        doc.moveDown();
        doc.fontSize(11).text(data.anamnese, { align: 'justify', lineGap: 5 });
        doc.moveDown(2);

        // Legal Declaration
        doc.fontSize(10).fillColor('#666').text('DECLARAÇÃO DE CIÊNCIA:', { bold: true });
        doc.text(
            'Autorizo a realização do procedimento acima descrito. Recebi todas as recomendações pré e pós procedimento, e estou ciente de minhas condições de saúde. ' +
            'Assumo total responsabilidade pelos cuidados posteriores seguindo as instruções da profissional corretamente.',
            { align: 'justify' }
        );

        doc.moveDown(4);
        
        // Signature
        const signatureY = doc.y;
        doc.moveTo(150, signatureY).lineTo(450, signatureY).stroke();
        doc.moveDown(0.5);
        doc.fontSize(10).text('Assinatura do Cliente', { align: 'center' });

        doc.end();
    });
}

export async function uploadAnamnesis(buffer: Buffer, filename: string, supabase: any) {
    // Tenta fazer o upload (o bucket deve ser público para links diretos funcionarem bem)
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
