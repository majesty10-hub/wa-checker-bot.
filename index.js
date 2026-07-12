const { default: makeWASocket, useMultiFileAuthState, delay, Browsers } = require('@whiskeysockets/baileys');
const TelegramBot = require('node-telegram-bot-api');
const pino = require('pino');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

if (!TELEGRAM_TOKEN) {
    console.error("❌ [ERROR] TELEGRAM_TOKEN belum diatur!");
    process.exit(1);
}

const tgBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
let waSock = null;
let isPairing = false;

tgBot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const status = waSock ? '🟢 Connected' : '🔴 Disconnected';
    const menu = `✨ ━━━ 🪐 <b>𝕎𝔸 ℂℍ𝔼ℂ𝕂𝔼ℝ 𝕧𝟝.𝟝</b> 🪐 ━━━ ✨\n\n⚡ Status Mesin: <b>${status}</b>\n\n📲 <b>/kirimkode</b> - Pairing Global\n🔍 <b>/cek [nomor]</b> - Cek Nomor`;
    tgBot.sendMessage(chatId, menu, { parse_mode: 'HTML' });
});

tgBot.onText(/\/kirimkode/, (msg) => {
    const chatId = msg.chat.id;
    isPairing = true;
    tgBot.sendMessage(chatId, '📞 Masukkan nomor WhatsApp (Contoh: +62882020925445)', { parse_mode: 'HTML' });
});

tgBot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : '';

    if (isPairing && /^\+?\d+$/.test(text)) {
        isPairing = false;
        tgBot.sendMessage(chatId, '⏳ <i>Menghubungkan ke server WhatsApp...</i>', { parse_mode: 'HTML' });
        
        try {
            const { state, saveCreds } = await useMultiFileAuthState('/tmp/wa_session');

            waSock = makeWASocket({
                auth: state,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                // Mengubah browser agent agar dikenali sebagai Google Chrome resmi oleh WhatsApp
                browser: Browsers.ubuntu('Chrome')
            });

            waSock.ev.on('creds.update', saveCreds);

            let formattedNum = text.replace(/[^0-9]/g, '');
            await delay(3000);
            
            if (waSock) {
                let code = await waSock.requestPairingCode(formattedNum);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                
                const suksesKode = `🔑 ━━━ ✨ <b>𝗞𝗢𝗗𝗘 𝗣𝗔𝗜𝗥𝗜𝗡𝗚 𝗔𝗡𝗗𝗔</b> ✨ ━━━ 🔑\n\n👉 📋 <code>${code}</code> 📋 👈\n\n💡 Masukkan kode ini secara manual di menu Perangkat Tertaut HP Anda!`;
                tgBot.sendMessage(chatId, suksesKode, { parse_mode: 'HTML' });
            }
        } catch (err) {
            tgBot.sendMessage(chatId, `❌ <b>Eror:</b> <code>${err.message}</code>`, { parse_mode: 'HTML' });
        }
    } 
    // ... bagian /cek tetap sama ...
});
