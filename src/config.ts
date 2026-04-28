import fs from 'fs';
import path from 'path';

export interface InstanceConfig {
    id: string;
    name: string;
    active: boolean;
    port: number;
    phoneNumber?: string;
    
    // Supabase
    supabaseUrl: string;
    supabaseKey: string;
    supabaseFunctionsUrl: string;
    botApiSecret: string;
    
    // Segurança
    webhookSecret: string;
    
    // Lembretes (loop interno)
    reminder24h: boolean;
    reminder1h: boolean;
    
    // Textos e Identidade
    welcomeExtra: string;
    websiteUrl: string;
    
    // Pagamentos
    misticClientId?: string;
    misticClientSecret?: string;
    mercadopagoAccessToken?: string;
    
    // Pasta de sessão
    sessionFolder?: string;
    
    // URL pública
    publicUrl?: string;

    // Mensagens Editáveis pelo Painel
    messages?: {
        welcome?: string;
        appointmentConfirmed?: string;
        appointmentCancelled?: string;
        reminder24h?: string;
        reminder1h?: string;
        paymentConfirmed?: string;
    };
}

/**
 * Carrega a configuração de uma empresa a partir do seu arquivo .json
 */
export function loadInstanceConfig(jsonFilePath: string): InstanceConfig {
    if (!fs.existsSync(jsonFilePath)) {
        throw new Error(`Arquivo de configuração não encontrado: ${jsonFilePath}`);
    }

    const data = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
    
    // Adiciona valores padrão se faltarem
    const config: InstanceConfig = {
        ...data,
        sessionFolder: data.sessionFolder || `sessions/${data.id}`,
    };

    // Cria a pasta de sessão se não existir
    const sessionPath = path.resolve(config.sessionFolder!);
    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }

    return config;
}

/**
 * Carrega todas as instâncias da pasta data/instances/
 */
export function loadAllInstances(): InstanceConfig[] {
    const instancesDir = path.resolve('data/instances');
    
    if (!fs.existsSync(instancesDir)) {
        fs.mkdirSync(instancesDir, { recursive: true });
        return [];
    }

    const files = fs.readdirSync(instancesDir).filter(f => f.endsWith('.json'));

    return files.map(f => loadInstanceConfig(path.join(instancesDir, f)));
}
