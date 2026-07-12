const { default: makeWASocket, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');
const TelegramBot = require('node-telegram-bot-api');
const pino = require('pino');
const fs = require('fs');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

if (!TELEGRAM_TOKEN) {
    console.error("ERROR: TELEGRAM_TOKEN belum diatur di GitHub Secrets!");
    process.exit(1);
}

const tgBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
let waSock = null;
let isPairing = false;

tgBot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const menu = `🤖 *WS CHECKER v5.0 (GitHub Actions Edition)*\n\n` +
                 `Status: ${waSock ? '🟢 Terhubung' : '🔴 Mati'}\n\n` +
                 `🔹 /kirimkode - Sambungkan WhatsApp via Pairing Code\n` +
                 `🔹 /cek [nomor] - Cek status nomor WhatsApp`;
    tgBot.sendMessage(chatId, menu, { parse_mode: 'Markdown' });
});

tgBot.onText(/\/kirimkode/, (msg) => {
    const chatId = msg.chat.id;
    isPairing = true;
    tgBot.sendMessage(chatId, '📞 Masukkan nomor WA tumbal Anda.\nFormat harus angka saja, contoh: *0882020925445*', { parse_mode: 'Markdown' });
});

tgBot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : '';

    if (isPairing && /^\d+$/.test(text)) {
        isPairing = false;
        tgBot.sendMessage(chatId, '⏳ Sedang meminta kode pairing, mohon tunggu...');
        
        try {
            const { state, saveCreds } = await useMultiFileAuthState('github_session');
            
            waSock = makeWASocket({
                auth: state,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false
            });

            waSock.ev.on('creds.update', saveCreds);

            waSock.ev.on('connection.update', async (update) => {
                const { connection } = update;
                if (connection === 'open') {
                    tgBot.sendMessage(chatId, '✅ *WhatsApp Berhasil Terhubung!*', { parse_mode: 'Markdown' });
                    
                    setTimeout(() => {
                        if (fs.existsSync('./github_session/creds.json')) {
                            const credsData = fs.readFileSync('./github_session/creds.json', 'utf-8');
                            const base64Session = Buffer.from(credsData).toString('base64');
                            tgBot.sendMessage(chatId, `🔑 *SALIN & SIMPAN SESI INI* 🔑\n\n\`${base64Session}\``, { parse_mode: 'Markdown' });
                        }
                    }, 5000);
                }
                if (connection === 'close') {
                    waSock = null;
                }
            });

            let formattedNum = text;
            if (formattedNum.startsWith('0')) {
                formattedNum = '62' + formattedNum.slice(1);
            }
            
            await delay(3000);
            let code = await waSock.requestPairingCode(formattedNum);
            code = code?.match(/.{1,4}/g)?.join('-') || code;
            
            tgBot.sendMessage(chatId, `🔑 *KODE PAIRING:* \`${code}\``, { parse_mode: 'Markdown' });
        } catch (err) {
            tgBot.sendMessage(chatId, `❌ Gagal: ${err.message}`);
            isPairing = false;
        }
    } else if (text.startsWith('/cek')) {
        if (!waSock) return tgBot.sendMessage(chatId, '🔴 Bot belum terhubung. Ketik /kirimkode dulu');
        
        const args = text.split(' ');
        if (args.length < 2) return tgBot.sendMessage(chatId, '❌ Format: `/cek 0882020925445`', { parse_mode: 'Markdown' });

        let targetNum = args[1].replace(/[^0-9]/g, '');
        if (targetNum.startsWith('0')) targetNum = '62' + targetNum.slice(1);

        tgBot.sendMessage(chatId, `🔍 Mengecek: +${targetNum}...`);

        try {
            const [result] = await waSock.onWhatsApp(targetNum);
            if (result && result.exists) {
                tgBot.sendMessage(chatId, `✅ Nomor +${targetNum} *Aktif*`, { parse_mode: 'Markdown' });
            } else {
                tgBot.sendMessage(chatId, `❌ Nomor +${targetNum} *Tidak Terdaftar*`, { parse_mode: 'Markdown' });
            }
        } catch (error) {
            tgBot.sendMessage(chatId, `⚠️ Error: ${error.message}`);
        }
    }
});
