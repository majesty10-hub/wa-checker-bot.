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
    tgBot.sendMessage(chatId, "🤖 *WA Checker Bot Aktif!*\n\nKetik /kirimkode untuk mulai pairing.", { parse_mode: 'Markdown' });
});

tgBot.onText(/\/kirimkode/, (msg) => {
    const chatId = msg.chat.id;
    isPairing = true;
    tgBot.sendMessage(chatId, '📞 Masukkan nomor WA tumbal Anda (contoh: 0882020925445)', { parse_mode: 'Markdown' });
});

tgBot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : '';

    if (isPairing && /^\d+$/.test(text)) {
        isPairing = false;
        tgBot.sendMessage(chatId, '⏳ Sedang menyiapkan mesin WhatsApp...');
        
        try {
            const { state, saveCreds } = await useMultiFileAuthState('github_session');
            
            // Inisialisasi socket
            waSock = makeWASocket({
                auth: state,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false
            });

            if (!waSock) {
                throw new Error("Gagal menginisialisasi socket.");
            }

            waSock.ev.on('creds.update', saveCreds);

            waSock.ev.on('connection.update', (update) => {
                const { connection } = update;
                if (connection === 'open') {
                    tgBot.sendMessage(chatId, '✅ *Berhasil Terhubung!*', { parse_mode: 'Markdown' });
                }
            });

            let formattedNum = text.startsWith('0') ? '62' + text.slice(1) : text;
            
            await delay(3000);
            
            // Memastikan waSock benar-benar ada sebelum meminta kode
            if (waSock && typeof waSock.requestPairingCode === 'function') {
                let code = await waSock.requestPairingCode(formattedNum);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                tgBot.sendMessage(chatId, `🔑 *KODE PAIRING:* \`${code}\``, { parse_mode: 'Markdown' });
            } else {
                tgBot.sendMessage(chatId, "❌ Mesin bot tidak merespons. Coba lagi nanti.");
            }

        } catch (err) {
            tgBot.sendMessage(chatId, `❌ Eror: ${err.message}`);
            isPairing = false;
        }
    }
});
        }
    }
});
