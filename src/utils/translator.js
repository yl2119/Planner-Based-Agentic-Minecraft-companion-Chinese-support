import translate from 'google-translate-api-x';

/**
 * Translation direction is controlled by ASR_LANGUAGE env var:
 *   ASR_LANGUAGE=zh → everything becomes Chinese  (input & output)
 *   ASR_LANGUAGE=en → everything becomes English   (input & output)
 *
 * This ensures LLM always sees text in the target language,
 * and TTS always speaks in the target language.
 */

function getAsrLang() {
    return (process.env.ASR_LANGUAGE || 'zh').trim().toLowerCase();
}

export async function handleTranslation(message) {
    // Output translation: ensure LLM response is in the ASR_LANGUAGE
    const asrLang = getAsrLang();
    if (asrLang === 'en')
        return message;  // LLM already outputs English, no translation needed
    // zh mode: translate output to Chinese
    try {
        const translation = await translate(message, { to: 'zh-CN', forceTo: true });
        return translation.text || message;
    } catch (error) {
        // Google Translate is blocked in China — just return original silently
        if (error?.cause?.code !== 'UND_ERR_CONNECT_TIMEOUT')
            console.error('Error translating message:', error.message);
        return message;
    }
}

export async function handleEnglishTranslation(message) {
    // Input translation: ensure user input reaches LLM in ASR_LANGUAGE
    const asrLang = getAsrLang();
    if (asrLang === 'zh') {
        // Chinese mode: translate English input to Chinese
        // Skip if already Chinese (has CJK characters)
        if (/[一-鿿]/.test(message))
            return message;
        try {
            const translation = await translate(message, { to: 'zh-CN', forceTo: true });
            if (translation.text) console.log(`[translate] EN→ZH: "${message}" → "${translation.text}"`);
            return translation.text || message;
        } catch (error) {
            if (error?.cause?.code !== 'UND_ERR_CONNECT_TIMEOUT')
                console.error('Error translating message:', error.message);
            return message;
        }
    } else {
        // English mode: translate Chinese input to English
        // Skip if already English (no CJK characters)
        if (!/[一-鿿]/.test(message))
            return message;
        try {
            const translation = await translate(message, { to: 'en', forceTo: true });
            if (translation.text) console.log(`[translate] ZH→EN: "${message}" → "${translation.text}"`);
            return translation.text || message;
        } catch (error) {
            if (error?.cause?.code !== 'UND_ERR_CONNECT_TIMEOUT')
                console.error('Error translating message:', error.message);
            return message;
        }
    }
}
