const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema({
    tenantId: { type: String, required: true, index: true },
    items: [
        {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
            name: String,
            price: Number,
            quantity: Number,
            subtotal: Number
        }
    ],
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    paymentMethod: { type: String, default: 'Cash' }, // <--- ဒီ Field ပါဝင်မှ Payment Method သိမ်းဆည်းပေးပါမည်
    paidAmount: { type: Number, default: 0 },
    changeAmount: { type: Number, default: 0 },
    cashierName: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Sale', saleSchema);
