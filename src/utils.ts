
export const SEPARATOR = '━━━━━━━━━━━━━━━━━━━━';

export const formatMsg = (template: string, vars: any = {}) => {
    let res = template;
    Object.keys(vars).forEach(key => {
        // Suporta {key} e {KEY}
        res = res.replace(new RegExp(`{${key}}`, 'g'), vars[key]);
        res = res.replace(new RegExp(`{${key.toUpperCase()}}`, 'g'), vars[key]);
    });
    return res;
};
