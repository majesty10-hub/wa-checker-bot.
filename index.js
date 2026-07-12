const { default: makeWASocket, delay } = require('@whiskeysockets/baileys');
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

// Perbaikan: Menambahkan struktur identitas 'me' agar Baileys tidak crash
let mockState = {
    creds: {
        registrationId: Math.floor(Math.random() * 10000),
        advSecretKey: "",
        nextPreKeyId: 1,
        firstUnuploadedPreKeyId: 1,
        accountSettings: { unarchiveChats: false },
        deviceId: "GitHub-Actions-Bot",
        phoneId: "Baileys-Engine",
        me: { id: "0@s.whatsapp.net", name: "Bot" } 
    },
    keys: {}
};

tgBot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const status = waSock ? '🟢 🟢 Connected' : '🔴 🔴 Disconnected';
    
    const menu = `✨ ━━━ 🪐 <b>𝕎𝔸 ℂℍ𝔼ℂ𝕂𝔼ℝ 𝕧𝟝.𝟝</b> 🪐 ━━━ ✨\n\n` +
                 `⚡ Status Mesin: <b>${status}</b>\n\n` +
                 `📲 <b>/kirimkode</b> - Pairing Global\n` +
                 `🔍 <b>/cek [nomor]</b> - Cek Nomor\n` +
                 `✨ ━━━━━━━━━━━━━━━━━━━ ✨`;
                 
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
        tgBot.sendMessage(chatId, '⏳ <i>Sedang menyiapkan mesin...</i>', { parse_mode: 'HTML' });
        
        try {
            waSock = makeWASocket({
                auth: {
                    state: mockState,
                    saveCreds: () => {}
                },
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false
            });

            let formattedNum = text.replace(/[^0-9]/g, '');
            await delay(3000);
            
            if (waSock) {
                let code = await waSock.requestPairingCode(formattedNum);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                tgBot.sendMessage(chatId, `🔑 <b>KODE PAIRING:</b> <code>${code}</code>`, { parse_mode: 'HTML' });
            }
        } catch (err) {
            tgBot.sendMessage(chatId, `❌ <b>Eror:</b> <code>${err.message}</code>`, { parse_mode: 'HTML' });
        }
    } 
    else if (text.startsWith('/cek')) {
        if (!waSock) return tgBot.sendMessage(chatId, '🔴 Hubungkan dulu via /kirimkode');
        
        const args = text.split(' ');
        let targetNum = args[1]?.replace(/[^0-9]/g, '');
        if (!targetNum) return tgBot.sendMessage(chatId, '❌ Format salah. Contoh: `/cek +62882020925445`');
        
        try {
            const [result] = await waSock.onWhatsApp(targetNum);
            if (result?.exists) {
                tgBot.sendMessage(chatId, `✅ +${targetNum} <b>AKTIF</b>`, { parse_mode: 'HTML' });
            } else {
                tgBot.sendMessage(chatId, `❌ +${targetNum} <b>TIDAK TERDAFTAR</b>`, { parse_mode: 'HTML' });
            }
        } catch (error) {
            tgBot.sendMessage(chatId, `⚠️ Gagal: <code>${error.message}</code>`, { parse_mode: 'HTML' });
        }
    }
});
