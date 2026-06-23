import translate from 'google-translate-api-x';
import settings from '../agent/settings.js';



export async function handleTranslation(message) {
    let preferred_lang = settings.language;
    if (!preferred_lang || preferred_lang === 'en' || preferred_lang === 'english')
        return message;
    try {
        const translation = await translate(message, { to: preferred_lang, forceTo: true });
        return translation.text || message;
    } catch (error) {
        // Google Translate is blocked in China — just return original silently
        if (error?.cause?.code !== 'UND_ERR_CONNECT_TIMEOUT')
            console.error('Error translating message:', error.message);
        return message;
    }
}

export async function handleEnglishTranslation(message) {
    let preferred_lang = String(settings.language).toLowerCase();
    if (!preferred_lang || preferred_lang === 'en' || preferred_lang === 'english')
        return message;
    try {
        const translation = await translate(message, { to: 'english' });
        return translation.text || message;
    } catch (error) {
        // Google Translate is blocked in China — just return original silently
        if (error?.cause?.code !== 'UND_ERR_CONNECT_TIMEOUT')
            console.error('Error translating message:', error.message);
        return message;
    }
}
