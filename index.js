const { default: makeWASocket, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');
const TelegramBot = require('node-telegram-bot-api');
const pino = require('pino');
const fs = require('fs');

// Mengambil token otomatis dari GitHub Secrets yang kamu buat tadi
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
                 `🔹 /cek [nomor] - Cek status nomor WhatsApp\n` +
                 `🔹 /help - Panduan format nomor`;
    tgBot.sendMessage(chatId, menu, { parse_mode: 'Markdown' });
});

tgBot.onText(/\/kirimkode/, (msg) => {
    const chatId = msg.chat.id;
    isPairing = true;
    tgBot.sendMessage(chatId, '📞 Masukkan nomor WA tumbal Anda.\nFormat harus angka saja tanpa spasi/tanda (+), contoh: *0882020925445*', { parse_mode: 'Markdown' });
});

tgBot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : '';

    if (isPairing && /^\d+$/.test(text)) {
        isPairing = false;
        tgBot.sendMessage(chatId, '⏳ Sedang meminta kode pairing dari WhatsApp, mohon tunggu...');
        
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
                    
                    // Trik Cerdas: Mengirimkan file sesi ke Telegram agar tidak amnesia
                    setTimeout(() => {
                        if (fs.existsSync('./github_session/creds.json')) {
                            const credsData = fs.readFileSync('./github_session/creds.json', 'utf-8');
                            const base64Session = Buffer.from(credsData).toString('base64');
                            tgBot.sendMessage(chatId, `🔑 *SALIN & SIMPAN SESI INI* 🔑\n\nJika bot mati, Anda cukup simpan kode ini:\n\n\`${base64Session}\``, { parse_mode: 'Markdown' });
                        }
                    }, 5000);
                }
                if (connection === 'close') {
                    waSock = null;
                }
            });

            // Otomatis merapikan format nomor 08xxx -> 628xxx
            let formattedNum = text;
            if (formattedNum.startsWith('0')) {
                formattedNum = '62' + formattedNum.slice(1);
            }
            
            await delay(3000);
            let code = await waSock.requestPairingCode(formattedNum);
            code = code?.match(/.{1,4}/g)?.join('-') || code;
            
            tgBot.sendMessage(chatId, `🔑 *KODE PAIRING ANDA:* \`${code}\`\n\nSilakan masukkan kode tersebut di WhatsApp -> Perangkat Tertaut.`, { parse_mode: 'Markdown' });

        } catch (err) {
            tgBot.sendMessage(chatId, `❌ Gagal memproses pairing: ${err.message}`);
            isPairing = false;
        }
    } else if (text.startsWith('/cek')) {
        if (!waSock) {
            return tgBot.sendMessage(chatId, '🔴 Bot belum terhubung ke WhatsApp. Silakan hubungkan dulu via /kirimkode');
        }
        
        const args = text.split(' ');
        if (args.length < 2) {
            return tgBot.sendMessage(chatId, '❌ Format salah. Contoh: `/cek 0882020925445`', { parse_mode: 'Markdown' });
        }

        let targetNum = args[1].replace(/[^0-9]/g, '');
        if (targetNum.startsWith('0')) {
            targetNum = '62' + targetNum.slice(1);
        }

        tgBot.sendMessage(chatId, `🔍 Sedang mengecek nomor: +${targetNum}...`);

        try {
            const [result] = await waSock.onWhatsApp(targetNum);
            if (result && result.exists) {
                tgBot.sendMessage(chatId, `✅ *Status:* Nomor +${targetNum} *Aktif* di WhatsApp.`, { parse_mode: 'Markdown' });
            } else {
                tgBot.sendMessage(chatId, `❌ *Status:* Nomor +${targetNum} *Tidak Terdaftar* di WhatsApp.`, { parse_mode: 'Markdown' });
            }
        } catch (error) {
            tgBot.sendMessage(chatId, `⚠️ Terjadi kesalahan saat mengecek: ${error.message}`);
        }
    }
});
                tgBot.sendMessage(chatId, `✅ *Status:* Nomor +${targetNum} *Aktif* di WhatsApp.`, { parse_mode: 'Markdown' });
            } else {
                tgBot.sendMessage(chatId, `❌ *Status:* Nomor +${targetNum} *Tidak Terdaftar* di WhatsApp.`, { parse_mode: 'Markdown' });
            }
        } catch (error) {
            tgBot.sendMessage(chatId, `⚠️ Terjadi kesalahan saat mengecek: ${error.message}`);
        }
    }
});
        hubungkanKeWhatsApp(msg.text, chatId, false);
        return;
    }

    if (msg.text.startsWith('/cek') && msg.reply_to_message && msg.reply_to_message.document) {
        if (!sock || !sock.user) return bot.sendMessage(chatId, "❌ Hubungkan WA terlebih dahulu.");
        const doc = msg.reply_to_message.document;
        if (!doc.file_name.endsWith('.txt')) return bot.sendMessage(chatId, "❌ Harus file `.txt`!");
        const statusMsg = await bot.sendMessage(chatId, "📥 *Membaca file...*", { parse_mode: 'Markdown' });
        
        let hasilKonten = `===================================================================================================\n`;
        hasilKonten += `NO. HP             | STATUS      | TIPE AKUN   | TANGGAL BIO SET      | TEXT BIO\n`;
        hasilKonten += `===================================================================================================\n`;
        
        try {
            const response = await axios.get(await bot.getFileLink(doc.file_id));
            const daftarNomor = response.data.toString().split(/\r?\n/).map(n => n.trim()).filter(n => n.length > 5);
            let terdaftarCount = 0, tidakTerdaftarCount = 0, counter = 0;

            for (let item of daftarNomor) {
                if (!sock || !sock.user) throw new Error("Putus");
                counter++;
                
                let target = item.replace(/[^0-9]/g, '');
                if (target.startsWith('08')) target = '628' + target.slice(2);
                let tipeAkun = "Biasa", bio = "(Disembunyikan)", waktuBio = "-";
                
                try {
                    const [result] = await sock.onWhatsApp(target + '@s.whatsapp.net');
                    if (result && result.exists) {
                        terdaftarCount++;
                        if (result.biz === true) tipeAkun = "Bisnis";
                        try {
                            const statusData = await sock.fetchStatus(result.jid);
                            if (statusData && statusData.status) {
                                bio = statusData.status.replace(/\n/g, ' ');
                                if (statusData.setAt) waktuBio = new Date(statusData.setAt).toLocaleDateString('id-ID') + " WIB";
                            }
                        } catch(e){}
                        hasilKonten += `${`+${target}`.padEnd(18, ' ')} | [🟢 AKTIF]  | ${tipeAkun.padEnd(11, ' ')} | ${waktuBio.padEnd(20, ' ')} | "${bio}"\n`;
                    } else {
                        tidakTerdaftarCount++;
                        hasilKonten += `${`+${target}`.padEnd(18, ' ')} | [🔴 MATI]   | -           | -                    | -\n`;
                    }
                } catch(e) {
                    tidakTerdaftarCount++;
                    hasilKonten += `${`+${target}`.padEnd(18, ' ')} | [🔴 MATI]   | -           | -                    | -\n`;
                }

                if (counter % 5 === 0 || counter === daftarNomor.length) {
                    await bot.editMessageText(`⏳ **PROSES TRANSPARAN CLOUD**\n📊 Progress: \`${counter}\` / \`${daftarNomor.length}\``, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }).catch(() => {});
                }
                await delay(250);
            }

            const namaFileHasil = `Hasil_Cek_${Date.now()}.txt`;
            fs.writeFileSync(namaFileHasil, hasilKonten, 'utf8');
            await bot.editMessageText(`✨ **Selesai!**`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' });
            await bot.sendDocument(chatId, namaFileHasil);
            fs.unlinkSync(namaFileHasil);
        } catch(e) {
            const namaFilePartial = `Hasil_Partial_${Date.now()}.txt`;
            fs.writeFileSync(namaFilePartial, hasilKonten + "\n\n⚠️ KONEKSI TERPUTUS!", 'utf8');
            await bot.sendDocument(chatId, namaFilePartial);
            fs.unlinkSync(namaFilePartial);
        }
    }
});

bot.onText(/\/start/, (msg) => sendMenu(msg.chat.id));

