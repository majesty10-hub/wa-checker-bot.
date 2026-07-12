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

async function initWA(chatId) {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('github_session');
        waSock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false
        });
        waSock.ev.on('creds.update', saveCreds);
        waSock.ev.on('connection.update', (update) => {
            const { connection } = update;
            if (connection === 'open') {
                tgBot.sendMessage(chatId, '✅ *WhatsApp Berhasil Terhubung!*', { parse_mode: 'Markdown' });
            }
            if (connection === 'close') {
                waSock = null;
            }
        });
    } catch (e) {
        tgBot.sendMessage(chatId, `❌ Gagal memuat mesin WA: ${e.message}`);
    }
}

tgBot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const menu = `🤖 *WS CHECKER v5.0*\n\n` +
                 `🔹 /kirimkode - Sambungkan WhatsApp via Pairing\n` +
                 `🔹 /cek [nomor] - Cek status nomor WhatsApp`;
    tgBot.sendMessage(chatId, menu, { parse_mode: 'Markdown' });
});

tgBot.onText(/\/kirimkode/, (msg) => {
    const chatId = msg.chat.id;
    isPairing = true;
    tgBot.sendMessage(chatId, '📞 Masukkan nomor WA tumbal Anda (contoh: 0882020925445)');
});

tgBot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : '';

    if (isPairing && /^\d+$/.test(text)) {
        isPairing = false;
        tgBot.sendMessage(chatId, '⏳ Sedang meminta kode pairing dari WhatsApp...');
        
        try {
            if (!waSock) {
                await initWA(chatId);
            }
            
            let formattedNum = text.startsWith('0') ? '62' + text.slice(1) : text;
            await delay(3000);
            
            if (waSock) {
                let code = await waSock.requestPairingCode(formattedNum);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                tgBot.sendMessage(chatId, `🔑 *KODE PAIRING ANDA:* \`${code}\``, { parse_mode: 'Markdown' });
            } else {
                tgBot.sendMessage(chatId, '❌ Gagal mengaktifkan mesin WhatsApp.');
            }
        } catch (err) {
            tgBot.sendMessage(chatId, `❌ Eror pairing: ${err.message}`);
        }
    } else if (text.startsWith('/cek')) {
        if (!waSock) {
            return tgBot.sendMessage(chatId, '🔴 Bot belum terhubung ke WhatsApp. Hubungkan dulu via /kirimkode');
        }
        const args = text.split(' ');
        if (args.length < 2) {
            return tgBot.sendMessage(chatId, '❌ Format salah. Contoh: `/cek 0882020925445`');
        }
        let targetNum = args[1].replace(/[^0-9]/g, '');
        if (targetNum.startsWith('0')) targetNum = '62' + targetNum.slice(1);
        
        tgBot.sendMessage(chatId, `🔍 Mengecek nomor: +${targetNum}...`);
        try {
            const [result] = await waSock.onWhatsApp(targetNum);
            if (result && result.exists) {
                tgBot.sendMessage(chatId, `✅ Nomor +${targetNum} *Aktif* di WhatsApp.`, { parse_mode: 'Markdown' });
            } else {
                tgBot.sendMessage(chatId, `❌ Nomor +${targetNum} *Tidak Terdaftar*.`, { parse_mode: 'Markdown' });
            }
        } catch (error) {
            tgBot.sendMessage(chatId, `⚠️ Terjadi kesalahan: ${error.message}`);
        }
    }
});
