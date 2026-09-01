const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'cashier'], default: 'cashier' },
    tenantId: { type: String, required: true } // Shop / Account အလိုက် သီးသန့်ခွဲခြားသည့် ID
});

module.exports = mongoose.model('User', userSchema);