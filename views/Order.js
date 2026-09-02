// Order Model (models/Order.js)
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    tenantId: String,
    items: Array,
    subtotal: Number,
    discount: Number,
    taxAmount: Number,
    totalAmount: Number,
    paymentMethod: String,
    paidAmount: Number,
    changeAmount: Number,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);