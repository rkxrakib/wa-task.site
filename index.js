const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const pino = require('pino');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// --- মঙ্গোডিবি কানেকশন ---
// নিচে <db_password> এর জায়গায় আপনার মঙ্গোডিবি পাসওয়ার্ড দিন
const MONGO_URL = "mongodb+srv://rkxrakib:<rkxrakib999>@cluster0.841rfpv.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URL)
    .then(() => console.log("Database Connected Successfully"))
    .catch(err => console.log("DB Connection Error: ", err));

// ইউজার ডাটাবেস মডেল
const UserSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    status: { type: String, default: "offline" }
});
const User = mongoose.model('User', UserSchema);

// রেজিস্ট্রেশন API
app.post('/api/register', async (req, res) => {
    const { phone, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ phone, password: hashedPassword });
        await newUser.save();
        res.json({ success: true, message: "Registration successful!" });
    } catch (e) {
        res.status(400).json({ error: "Number already exists!" });
    }
});

// লগইন API
app.post('/api/login', async (req, res) => {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (user && await bcrypt.compare(password, user.password)) {
        res.json({ success: true, phone: user.phone, balance: user.balance, points: user.points });
    } else {
        res.status(400).json({ error: "Invalid phone or password!" });
    }
});

// হোয়াটসঅ্যাপ পেয়ারিং কোড জেনারেটর
app.get('/api/get-code', async (req, res) => {
    const phone = req.query.number;
    if(!phone) return res.status(400).json({error: "Phone needed"});

    try {
        const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${phone}`);
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "silent" })
        });

        if (!sock.authState.creds.registered) {
            await delay(3000);
            const code = await sock.requestPairingCode(phone);
            res.json({ code });
        } else {
            res.json({ error: "Already logged in" });
        }

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (update) => {
            if (update.connection === 'open') {
                await User.findOneAndUpdate({ phone: req.query.userPhone }, { status: "online" });
                console.log(`WA Connected for ${phone}`);
            }
        });
    } catch (e) {
        res.status(500).json({ error: "Server error" });
    }
});

app.listen(3000, () => console.log("Server running on port 3000"));
