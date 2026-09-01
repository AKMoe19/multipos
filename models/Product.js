const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    barcode: { type: String },
    costPrice: { type: Number, default: 0 }, // ဝယ်ဈေး
    price: { type: Number, required: true },
    stock: { type: Number, required: true },
    category: { type: String, default: 'General' },
    image: { type: String, default: '' },
    tenantId: { type: String, required: true, index: true }, // Shop ခွဲခြားရန်
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);