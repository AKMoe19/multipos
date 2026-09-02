require('dotenv').config(); // .env ဖိုင်ကို ဖတ်ယူရန် ထည့်သွင်းခြင်း

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const User = require('./models/User');
const Product = require('./models/Product');
const Sale = require('./models/Sale');
const Category = require('./models/Category');

const app = express();

// MongoDB Connection Cloud or Localhost
const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/multi_tenant_pos';

mongoose.connect(mongoURI)
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Middleware
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

app.use(session({
    secret: 'pos_multi_tenant_secret_key',
    resave: false,
    saveUninitialized: false
}));

// Upload Setup for Product Images
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (req, file, cb) => {
        cb(null, 'prod-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
            return cb(null, true);
        }
        cb(new Error('Images only!'));
    }
});

// JSON Upload Setup for Import Data
const jsonStorage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (req, file, cb) => {
        cb(null, 'backup-' + Date.now() + path.extname(file.originalname));
    }
});
const jsonUpload = multer({
    storage: jsonStorage,
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() === '.json') {
            return cb(null, true);
        }
        cb(new Error('JSON files only!'));
    }
});

// Auth Middleware
const isAuth = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') return next();
    res.status(403).send('Access Denied: Admin Only');
};

// ---------------- ROUTES ----------------

// Root Route
app.get('/', (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'admin') {
            return res.redirect('/admin');
        }
        return res.redirect('/pos');
    }
    res.redirect('/login');
});

// Login Routes
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) return res.render('login', { error: 'Username သို့မဟုတ် Password မှားယွင်းနေပါသည်။' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.render('login', { error: 'Username သို့မဟုတ် Password မှားယွင်းနေပါသည်။' });

        req.session.user = {
            id: user._id,
            username: user.username,
            role: user.role,
            tenantId: user.tenantId
        };

        if (user.role === 'admin') {
            res.redirect('/admin');
        } else {
            res.redirect('/pos');
        }
    } catch (err) {
        res.render('login', { error: 'Server Error ဖြစ်ပေါ်နေပါသည်။' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// ==================== CASHIER MANAGEMENT ROUTES ====================

app.get('/admin/users', isAuth, isAdmin, async (req, res) => {
    const tenantId = req.session.user.tenantId;
    const cashiers = await User.find({ tenantId, role: 'cashier' });
    res.render('users', { user: req.session.user, cashiers, error: null, success: null });
});

app.post('/admin/users/add', isAuth, isAdmin, async (req, res) => {
    const { username, password } = req.body;
    const tenantId = req.session.user.tenantId;

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            const cashiers = await User.find({ tenantId, role: 'cashier' });
            return res.render('users', { 
                user: req.session.user, 
                cashiers, 
                error: 'ဒီ User Name ကို သုံးထားပြီး ဖြစ်ပါသည်။ အခြား User Name ပြောင်းပေးပါ။',
                success: null 
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({
            username,
            password: hashedPassword,
            role: 'cashier',
            tenantId
        });

        res.redirect('/admin/users');
    } catch (err) {
        res.status(500).send("Cashier အကောင့် ဖန်တီးရာတွင် အမှားအယွင်း ရှိနေပါသည်။");
    }
});

app.post('/admin/users/edit/:id', isAuth, isAdmin, async (req, res) => {
    const { username, newPassword } = req.body;
    const tenantId = req.session.user.tenantId;

    try {
        const cashier = await User.findOne({ _id: req.params.id, tenantId, role: 'cashier' });
        if (!cashier) return res.status(404).send("Cashier အကောင့် မတွေ့ပါ။");

        cashier.username = username;
        
        if (newPassword && newPassword.trim() !== "") {
            cashier.password = await bcrypt.hash(newPassword, 10);
        }

        await cashier.save();
        res.redirect('/admin/users');
    } catch (err) {
        res.status(500).send("Cashier အကောင့် ပြင်ဆင်ရာတွင် အမှားအယွင်း ရှိနေပါသည်။");
    }
});

app.get('/admin/users/delete/:id', isAuth, isAdmin, async (req, res) => {
    const tenantId = req.session.user.tenantId;
    await User.findOneAndDelete({ _id: req.params.id, tenantId, role: 'cashier' });
    res.redirect('/admin/users');
});

// ==================== ADMIN DASHBOARD & CATEGORY ROUTES ====================

// Admin Dashboard Route
app.get('/admin', isAuth, isAdmin, async (req, res) => {
    const tenantId = req.session.user.tenantId;
    const products = await Product.find({ tenantId }).sort({ createdAt: -1 });
    const categories = await Category.find({ tenantId }).sort({ name: 1 });
    const lowStockProducts = products.filter(p => p.stock <= 5);

    res.render('admin', { 
        user: req.session.user, 
        products, 
        categories,
        lowStockProducts 
    });
});

// Category အသစ်ထည့်ရန် Route
app.post('/admin/add-category', isAuth, isAdmin, async (req, res) => {
    const { name } = req.body;
    const tenantId = req.session.user.tenantId;

    if (name && name.trim() !== '') {
        await Category.create({ name: name.trim(), tenantId });
    }
    res.redirect('/admin');
});

// Category ဖျက်ရန် Route
app.get('/admin/delete-category/:id', isAuth, isAdmin, async (req, res) => {
    const tenantId = req.session.user.tenantId;
    await Category.findOneAndDelete({ _id: req.params.id, tenantId });
    res.redirect('/admin');
});

// Add Product Route
app.post('/admin/add-product', isAuth, isAdmin, upload.single('image'), async (req, res) => {
    let { name, barcode, costPrice, price, stock, category } = req.body;
    const tenantId = req.session.user.tenantId;

    const image = req.file ? '/uploads/' + req.file.filename : '/images/default-product.png';

    if (!barcode || barcode.trim() === '') {
        const randomNum = Math.floor(100000999 + Math.random() * 900000000);
        barcode = '200' + randomNum;
    }

    try {
        await Product.create({
            name,
            barcode,
            costPrice: Number(costPrice) || 0,
            price: Number(price),
            stock: Number(stock),
            category: category || 'General',
            image,
            tenantId
        });
        res.redirect('/admin');
    } catch (err) {
        console.error("Add Product Error:", err);
        res.status(500).send("Product ထည့်သွင်းရာတွင် အမှားအယွင်း ရှိနေပါသည်။");
    }
});

// Edit Product Route
app.post('/admin/edit-product/:id', isAuth, isAdmin, upload.single('image'), async (req, res) => {
    const { name, barcode, costPrice, price, stock, category } = req.body;
    const tenantId = req.session.user.tenantId;

    const updateData = {
        name,
        barcode,
        costPrice: Number(costPrice) || 0,
        price: Number(price),
        stock: Number(stock),
        category
    };

    if (req.file) {
        updateData.image = '/uploads/' + req.file.filename;
    }

    await Product.findOneAndUpdate({ _id: req.params.id, tenantId }, updateData);
    res.redirect('/admin');
});

// Quick Update Stock Route
app.post('/admin/quick-update-stock', isAuth, isAdmin, async (req, res) => {
    const { productId, stock } = req.body;
    const tenantId = req.session.user.tenantId;

    try {
        await Product.findOneAndUpdate({ _id: productId, tenantId }, { stock: Number(stock) });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// Delete Product Route
app.get('/admin/delete-product/:id', isAuth, isAdmin, async (req, res) => {
    const tenantId = req.session.user.tenantId;
    await Product.findOneAndDelete({ _id: req.params.id, tenantId });
    res.redirect('/admin');
});

// Database Search API Route
app.get('/pos/search', isAuth, async (req, res) => {
    const tenantId = req.session.user.tenantId;
    const { q, category } = req.query;

    try {
        let filter = { tenantId, stock: { $gt: 0 } };

        if (category && category !== 'ALL') {
            filter.category = category;
        }

        if (q && q.trim() !== '') {
            filter.$or = [
                { name: { $regex: q.trim(), $options: 'i' } },
                { barcode: { $regex: q.trim(), $options: 'i' } }
            ];
        }

        const products = await Product.find(filter).limit(50);
        res.json({ success: true, products });
    } catch (err) {
        console.error("Search Error:", err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Backup Export Route
app.get('/admin/backup-data', isAuth, isAdmin, async (req, res) => {
    const tenantId = req.session.user.tenantId;
    const products = await Product.find({ tenantId });
    const sales = await Sale.find({ tenantId });

    const backupData = {
        tenantId,
        exportedAt: new Date(),
        products,
        sales
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=backup-${tenantId}-${Date.now()}.json`);
    res.send(JSON.stringify(backupData, null, 2));
});

// Backup Import Route
app.post('/admin/import-data', isAuth, isAdmin, jsonUpload.single('backupFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send("ကျေးဇူးပြု၍ JSON ဖိုင် ရွေးပေးပါ။");

        const filePath = req.file.path;
        const fileData = fs.readFileSync(filePath, 'utf8');
        const importedData = JSON.parse(fileData);
        const tenantId = req.session.user.tenantId;

        if (importedData.products && Array.isArray(importedData.products)) {
            for (const prod of importedData.products) {
                const { _id, ...rest } = prod;
                rest.tenantId = tenantId;
                await Product.findByIdAndUpdate(_id || new mongoose.Types.ObjectId(), rest, { upsert: true, new: true });
            }
        }

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send("Import လုပ်ရာတွင် အမှားအယွင်း ရှိနေပါသည်။");
    }
});

// POS Cashier Dashboard Route
app.get('/pos', isAuth, async (req, res) => {
    const tenantId = req.session.user.tenantId;
    const products = await Product.find({ tenantId, stock: { $gt: 0 } });
    
    const categories = ['ALL', ...new Set(products.map(p => p.category))];

    res.render('pos', { user: req.session.user, products, categories });
});

// Checkout Route
// app.post('/pos/checkout', isAuth, async (req, res) => {
//     const tenantId = req.session.user.tenantId;
//     const { items, totalAmount, total, subtotal, discount, taxAmount, paymentMethod, paidAmount, changeAmount } = req.body;

//     const finalTotal = totalAmount || total || 0;

//     try {
//         if (!items || !Array.isArray(items) || items.length === 0) {
//             return res.status(400).json({ success: false, message: 'Cart ထဲတွင် ပစ္စည်းမရှိပါ။' });
//         }

//         const saleItems = [];

//         for (const item of items) {
//             const productId = item.id || item._id;
//             const quantity = Number(item.quantity || item.qty || 0);

//             const product = await Product.findOne({ _id: productId, tenantId });

//             if (!product) {
//                 return res.status(404).json({ 
//                     success: false, 
//                     message: `Product မတွေ့ရှိပါ။: ${item.name || ''}` 
//                 });
//             }

//             if (product.stock >= quantity) {
//                 product.stock -= quantity;
//                 await product.save();

//                 saleItems.push({
//                     productId: product._id,
//                     name: product.name,
//                     price: product.price,
//                     quantity: quantity,
//                     subtotal: product.price * quantity
//                 });
//             } else {
//                 return res.status(400).json({ 
//                     success: false, 
//                     message: `Stock မလုံလောက်ပါ: ${product.name}` 
//                 });
//             }
//         }

//         await Sale.create({
//             tenantId,
//             items: saleItems,
//             totalAmount: finalTotal,
//             subtotal: Number(subtotal) || 0,
//             discount: Number(discount) || 0,
//             taxAmount: Number(taxAmount) || 0,
//             paymentMethod: paymentMethod || 'Cash',
//             paidAmount: Number(paidAmount) || 0,
//             changeAmount: Number(changeAmount) || 0,
//             cashierName: req.session.user.username
//         });

//         res.json({ success: true, message: 'ရောင်းချမှု အောင်မြင်ပါသည်။' });

//     } catch (err) {
//         console.error("Checkout Error:", err);
//         res.status(500).json({ success: false, message: 'Server Error' });
//     }
// });

// POS Checkout Controller (app.js သို့မဟုတ် routes/pos.js)
// app.post('/pos/checkout', async (req, res) => {
//     try {
//         const { items, subtotal, discount, taxAmount, totalAmount, paymentMethod, paidAmount, changeAmount } = req.body;

//         // ၁။ Order မှတ်တမ်းအသစ် သိမ်းဆည်းခြင်း
//         const newOrder = new Order({
//             tenantId: req.user.tenantId,
//             items,
//             subtotal,
//             discount,
//             taxAmount,
//             totalAmount,
//             paymentMethod,
//             paidAmount,
//             changeAmount
//         });
//         await newOrder.save();

//         // ၂။ Product Stock အရေအတွက် လျှော့ချခြင်း
//         for (let item of items) {
//             await Product.findByIdAndUpdate(item.id || item._id, {
//                 $inc: { stock: - (item.quantity || item.qty) }
//             });
//         }

//         res.json({ success: true, message: "ရောင်းချမှု အောင်မြင်ပါသည်။" });
//     } catch (err) {
//         console.error("Checkout Error:", err);
//         res.status(500).json({ success: false, message: "Server Error" });
//     }
// });

// Checkout Route (အရောင်းမှတ်တမ်း သိမ်းဆည်းခြင်း နှင့် Stock လျှော့ခြင်း)
app.post('/pos/checkout', isAuth, async (req, res) => {
    try {
        const tenantId = req.session.user.tenantId;
        const { items, totalAmount, total, subtotal, discount, taxAmount, paymentMethod, paidAmount, changeAmount } = req.body;

        const finalTotal = totalAmount || total || 0;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart ထဲတွင် ပစ္စည်းမရှိပါ။' });
        }

        const saleItems = [];

        // 1. Stock စစ်ဆေးခြင်းနှင့် ရောင်းမည့် စာရင်း ပြင်ဆင်ခြင်း
        for (const item of items) {
            const productId = item.id || item._id;
            const quantity = Number(item.quantity || item.qty || 0);

            const product = await Product.findOne({ _id: productId, tenantId });

            if (!product) {
                return res.status(404).json({ 
                    success: false, 
                    message: `Product မတွေ့ရှိပါ။: ${item.name || ''}` 
                });
            }

            if (product.stock < quantity) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Stock မလုံလောက်ပါ: ${product.name}` 
                });
            }

            // Stock လျှော့ချခြင်း
            product.stock -= quantity;
            await product.save();

            saleItems.push({
                productId: product._id,
                name: product.name,
                price: product.price,
                quantity: quantity,
                subtotal: product.price * quantity
            });
        }

        // 2. Sale Model တွင် အရောင်းမှတ်တမ်း သိမ်းဆည်းခြင်း
        const newSale = await Sale.create({
            tenantId,
            items: saleItems,
            totalAmount: finalTotal,
            subtotal: Number(subtotal) || 0,
            discount: Number(discount) || 0,
            taxAmount: Number(taxAmount) || 0,
            paymentMethod: paymentMethod || 'Cash',
            paidAmount: Number(paidAmount) || 0,
            changeAmount: Number(changeAmount) || 0,
            cashierName: req.session.user.username
        });

        res.json({ 
            success: true, 
            message: 'ရောင်းချမှု အောင်မြင်ပါသည်။',
            saleId: newSale._id 
        });

    } catch (err) {
        console.error("Checkout Error:", err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// History List Route ( Sale Model ဖြင့် ပြန်လည်ပြသခြင်း )
app.get('/history', isAuth, async (req, res) => {
    try {
        const tenantId = req.session.user.tenantId;
        const { search, paymentMethod, startDate, endDate } = req.query;

        let query = { tenantId };

        // Payment Filter
        if (paymentMethod && paymentMethod !== 'ALL') {
            query.paymentMethod = paymentMethod;
        }

        // Date Range Filter
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) {
                let end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }

        let orders = await Sale.find(query).sort({ createdAt: -1 });

        // Search Filter
        if (search) {
            orders = orders.filter(o => 
                o._id.toString().toLowerCase().includes(search.toLowerCase()) ||
                (o.cashierName && o.cashierName.toLowerCase().includes(search.toLowerCase()))
            );
        }

        res.render('history', {
            orders,
            filters: { search, paymentMethod, startDate, endDate },
            user: req.session.user
        });
    } catch (err) {
        console.error("History Fetch Error:", err);
        res.status(500).send("Server Error");
    }
});

// Default Admin Accounts
async function initAccounts() {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
        const hashedPassword1 = await bcrypt.hash('admin123', 10);
        const hashedPassword2 = await bcrypt.hash('admin123', 10);

        await User.create([
            { username: 'user1', password: hashedPassword1, role: 'admin', tenantId: 'tenant_shop_1' },
            { username: 'user2', password: hashedPassword2, role: 'admin', tenantId: 'tenant_shop_2' }
        ]);
        console.log('Default Accounts Created:');
        console.log('1. Username: user1 | Password: admin123 (Shop 1)');
        console.log('2. Username: user2 | Password: admin123 (Shop 2)');
    }
}
initAccounts();

// Start Server (.env ဖိုင်ထဲမှ PORT ကို အသုံးပြုခြင်း)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});