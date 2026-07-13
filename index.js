const TelegramBot = require('node-telegram-bot-api');
const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const fs = require('fs');

const TELEGRAM_BOT_TOKEN = "8900613624:AAGHTnoVyf_Uia52E_fYNTDa-sYk9EJuzic";

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
let sock = null;
let isConnecting = false;

let cacheFileData = {};
let cacheHasilScan = {};

// FUNGSI UTAMA KONEKSI
async function hubungkanKeWhatsApp(nomorHPTumbal = null, chatId = null, isRetry = false, forceNewSession = false) {
    if (isConnecting && !isRetry && !forceNewSession) return;
    isConnecting = true;

    // Bersihkan sesi jika dipaksa (Banned/Pairing Ulang)
    const sessionDir = '/data/sesi_wa';
    if (forceNewSession && fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    // AMBIL VERSI WHATSAPP TERBARU BIAR GAK KENA 405
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    sock = makeWASocket({ 
        version,
        auth: state, 
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        // Spoofing identitas sebagai Ubuntu Chrome (Lebih Stabil)
        browser: ["Ubuntu", "Chrome", "121.0.6167.140"] 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            isConnecting = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            
            // JIKA BANNED / LOGOUT
            if (statusCode === DisconnectReason.loggedOut) {
                if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
                if (chatId) bot.sendMessage(chatId, "🚨 **[BANNED]** Akun terblokir. Ganti nomor tumbal baru.");
            } 
            // JIKA 405 (METHOD NOT ALLOWED) - JANGAN LANGSUNG SPAM RECONNECT
            else if (statusCode === 405) {
                console.log("[🚨 ERROR 405] WhatsApp menolak IP Railway ini. Mencoba jeda 30 detik...");
                await delay(30000); 
                hubungkanKeWhatsApp(null, chatId, true, false);
            }
            else {
                // Reconnect otomatis jika sudah punya sesi aktif
                if (state.creds?.me?.id) {
                    await delay(10000);
                    hubungkanKeWhatsApp(null, chatId, true, false);
                }
            }
        } 
        else if (connection === 'open') {
            isConnecting = false;
            if (chatId) bot.sendMessage(chatId, "🛸 **[CONNECTED]** Matrix Active!");
            console.log("[SYSTEM] WhatsApp Connected!");
        }
    });

    // REQUEST KODE PAIRING
    if (nomorHPTumbal) {
        try {
            let nomorBersih = nomorHPTumbal.replace(/[^0-9]/g, '');
            if (nomorBersih.startsWith('08')) nomorBersih = '628' + nomorBersih.slice(2);
            
            await delay(5000); // Jeda lebih lama biar server WA gak kaget
            if (chatId) bot.sendMessage(chatId, `🛰️ **[REQUESTING CODE]** Target: \`+${nomorBersih}\``, { parse_mode: 'Markdown' });
            
            const code = await sock.requestPairingCode(nomorBersih);
            const teksKode = code?.match(/.{1,4}/g)?.join('-') || code;
            if (chatId) bot.sendMessage(chatId, `🔑 **KODE PAIRING LU:**\n\n👉  \`${teksKode}\`  👈`, { parse_mode: 'Markdown' });
        } catch (err) {
            isConnecting = false;
            console.error(err);
            if (chatId) bot.sendMessage(chatId, "❌ **[ERROR]** Server Railway kena limit. Coba 5 menit lagi.");
        }
    }
}

// LOGIKA TELEGRAM BOT
bot.on('callback_query', (query) => {
    if (query.data === 'sambungkan') {
        bot.sendMessage(query.message.chat.id, "Masukkan nomor HP (Contoh: 26134xxxx):", { reply_markup: { force_reply: true } });
    }
});

bot.on('message', async (msg) => {
    if (msg.reply_to_message?.text?.includes('Masukkan nomor HP')) {
        bot.sendMessage(msg.chat.id, "⚡ **[INITIALIZING]** Mencoba menembus enkripsi...");
        hubungkanKeWhatsApp(msg.text, msg.chat.id, false, true);
    }
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🤖 **JEJEST CHECKER V3.8 CLOUD**", {
        reply_markup: { inline_keyboard: [[{ text: "⚡ Sambungkan Pairing", callback_data: "sambungkan" }]] }
    });
});

// STARTUP
console.log("[SYSTEM] Booting...");
hubungkanKeWhatsApp(null, null, false, false);
