const { default: makeWASocket, useEphemeralState, delay } = require('@whiskeysockets/baileys');
const TelegramBot = require('node-telegram-bot-api');
const pino = require('pino');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

if (!TELEGRAM_TOKEN) {
    console.error("ERROR: TELEGRAM_TOKEN belum diatur!");
    process.exit(1);
}

const tgBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
let waSock = null;
let isPairing = false;

tgBot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const menu = `🤖 *WS CHECKER v5.5 (International Edition)*\n\n🔹 /kirimkode - Sambungkan WhatsApp via Pairing\n🔹 /cek [nomor] - Cek status nomor WhatsApp`;
    tgBot.sendMessage(chatId, menu, { parse_mode: 'Markdown' });
});

tgBot.onText(/\/kirimkode/, (msg) => {
    const chatId = msg.chat.id;
    isPairing = true;
    tgBot.sendMessage(chatId, '📞 *Masukkan nomor WA tumbal Anda.*\n\n⚠️ *PENTING:* Gunakan kode negara di depan, tanda (+) diperbolehkan.\nContoh Indonesia: `+62882020925445` atau `62882020925445`\nContoh Luar Negeri: `+1234567890`', { parse_mode: 'Markdown' });
});

tgBot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : '';

    // Menerima input nomor yang mengandung angka dan tanda plus di awal
    if (isPairing && /^\+?\d+$/.test(text)) {
        isPairing = false;
        tgBot.sendMessage(chatId, '⏳ Sedang meminta kode pairing langsung dari server WhatsApp...');
        
        try {
            waSock = makeWASocket({
                auth: useEphemeralState(),
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false
            });

            // Bersihkan tanda "+" dan karakter non-angka lainnya agar menjadi format string angka bersih (pure digits)
            let formattedNum = text.replace(/[^0-9]/g, '');
            
            await delay(3000);
            
            if (waSock) {
                let code = await waSock.requestPairingCode(formattedNum);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                tgBot.sendMessage(chatId, `🔑 *KODE PAIRING ANDA:* \`${code}\`\n\nSegera masukkan ke WhatsApp -> Perangkat Tertaut sebelum kedaluwarsa.`, { parse_mode: 'Markdown' });
            } else {
                tgBot.sendMessage(chatId, '❌ Mesin WhatsApp gagal merespons.');
            }
        } catch (err) {
            tgBot.sendMessage(chatId, `❌ Eror: ${err.message}`);
        }
    } else if (text.startsWith('/cek')) {
        if (!waSock) return tgBot.sendMessage(chatId, '🔴 Hubungkan dulu via /kirimkode');
        const args = text.split(' ');
        if (args.length < 2) return tgBot.sendMessage(chatId, '❌ Format salah. Contoh: `/cek +62882020925445` atau `/cek +1234567890`');
        
        // Membersihkan nomor target cek dari tanda "+" atau spasi
        let targetNum = args[1].replace(/[^0-9]/g, '');
        
        tgBot.sendMessage(chatId, `🔍 Mengecek nomor: +${targetNum}...`);
        try {
            const [result] = await waSock.onWhatsApp(targetNum);
            if (result && result.exists) {
                tgBot.sendMessage(chatId, `✅ Nomor +${targetNum} *Aktif* di WhatsApp.`, { parse_mode: 'Markdown' });
            } else {
                tgBot.sendMessage(chatId, `❌ Nomor +${targetNum} *Tidak Terdaftar*.`, { parse_mode: 'Markdown' });
            }
        } catch (error) {
            tgBot.sendMessage(chatId, `⚠️ Gagal mengecek: ${error.message}`);
        }
    }
});
