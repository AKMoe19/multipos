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
    totalAmount: { type: Number, required: true },
    cashierName: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Sale', saleSchema);