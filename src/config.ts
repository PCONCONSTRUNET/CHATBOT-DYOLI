import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const MASTER_URL = process.env.MASTER_SUPABASE_URL;
const MASTER_KEY = process.env.MASTER_SUPABASE_KEY;

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

    // Perguntas e Respostas Extras (FAQ)
    faq?: {
        question: string;
        answer: string;
    }[];
    menu?: any[];
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

/**
 * Carrega a configuração de uma instância a partir do banco mestre
 */
export async function loadConfigFromDb(slug: string): Promise<InstanceConfig> {
    if (!MASTER_URL || !MASTER_KEY) {
        throw new Error('MASTER_SUPABASE_URL ou MASTER_SUPABASE_KEY não configurados no .env');
    }

    const supabase = createClient(MASTER_URL, MASTER_KEY);
    const { data, error } = await supabase
        .from('instances')
        .select('*')
        .eq('slug', slug)
        .single();

    if (error || !data) {
        throw new Error(`Instância ${slug} não encontrada no banco: ${error?.message}`);
    }

    return {
        id: data.slug,
        name: data.name,
        active: data.active,
        port: data.port,
        supabaseUrl: data.supabase_url,
        supabaseKey: data.supabase_key,
        supabaseFunctionsUrl: data.supabase_functions_url,
        botApiSecret: data.bot_api_secret,
        webhookSecret: data.webhook_secret,
        websiteUrl: data.website_url,
        welcomeExtra: data.welcome_extra,
        mercadopagoAccessToken: data.mercadopago_access_token,
        messages: data.messages,
        faq: data.faq,
        menu: data.menu || [],
        reminder24h: data.reminder24h,
        reminder1h: data.reminder1h,
        sessionFolder: data.session_folder || `sessions/${data.slug}`
    };
}

/**
 * Carrega todas as instâncias ativas do banco mestre
 */
export async function loadAllInstancesFromDb(): Promise<InstanceConfig[]> {
    if (!MASTER_URL || !MASTER_KEY) {
        throw new Error('MASTER_SUPABASE_URL ou MASTER_SUPABASE_KEY não configurados no .env');
    }

    const supabase = createClient(MASTER_URL, MASTER_KEY);
    const { data, error } = await supabase
        .from('instances')
        .select('*')
        .eq('active', true);

    if (error || !data) {
        throw new Error(`Erro ao buscar instâncias no banco: ${error?.message}`);
    }

    return data.map(inst => ({
        id: inst.slug,
        name: inst.name,
        active: inst.active,
        port: inst.port,
        supabaseUrl: inst.supabase_url,
        supabaseKey: inst.supabase_key,
        supabaseFunctionsUrl: inst.supabase_functions_url,
        botApiSecret: inst.bot_api_secret,
        webhookSecret: inst.webhook_secret,
        websiteUrl: inst.website_url,
        welcomeExtra: inst.welcome_extra,
        mercadopagoAccessToken: inst.mercadopago_access_token,
        messages: inst.messages,
        faq: inst.faq,
        menu: inst.menu || [],
        reminder24h: inst.reminder24h,
        reminder1h: inst.reminder1h,
        sessionFolder: inst.session_folder || `sessions/${inst.slug}`
    }));
}
