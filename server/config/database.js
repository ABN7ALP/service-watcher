const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // استخدم اسم قاعدة بيانات خاص بعجلة الحظ
        const dbName = 'spin-wheel-db';
        const mongoURI = process.env.MONGODB_URI;
        
        // إذا كان هناك URI مخصص، استخدمه
        // وإلا أنشئ URI مع اسم قاعدة البيانات
        let connectionString;
        
        if (mongoURI) {
            // تأكد من أن URI يحتوي على اسم قاعدة البيانات
            connectionString = mongoURI;
            if (!mongoURI.includes('/?') && !mongoURI.includes('/' + dbName)) {
                // أضف اسم قاعدة البيانات إلى URI
                connectionString = mongoURI.endsWith('/') 
                    ? mongoURI + dbName 
                    : mongoURI + '/' + dbName;
            }
        } else {
            // URI محلي للتنمية
            connectionString = `mongodb://localhost:27017/${dbName}`;
        }
        
        // خيارات اتصال إضافية
        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            // إزالة أي فهارس قديمة تسبب مشاكل
            autoIndex: true,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4
        };
        
        await mongoose.connect(connectionString, options);
        
        console.log(`✅ MongoDB Connected to: ${dbName}`);
        
        // إزالة أي فهارس مسببة للمشاكل
        await cleanupOldIndexes();
        
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    }
};

// دالة لتنظيف الفهارس القديمة
async function cleanupOldIndexes() {
    try {
        const collections = await mongoose.connection.db.collections();
        
        for (let collection of collections) {
            try {
                // احصل على جميع الفهارس
                const indexes = await collection.indexes();
                
                // ابحث عن فهارس id القديمة وأزل أي تكرارات
                for (let index of indexes) {
                    if (index.name === 'id_1' || (index.key && index.key.id === 1)) {
                        console.log(`⚠️  Removing duplicate index: ${index.name} from ${collection.collectionName}`);
                        await collection.dropIndex(index.name);
                    }
                }
            } catch (err) {
                console.log(`ℹ️  Could not process indexes for ${collection.collectionName}:`, err.message);
            }
        }
        
        console.log('✅ Database indexes cleaned up');
    } catch (error) {
        console.log('ℹ️  Index cleanup skipped:', error.message);
    }
}

// إعادة تعيين قاعدة البيانات (للتنمية فقط)
const resetDatabase = async () => {
    if (process.env.NODE_ENV === 'development') {
        try {
            await mongoose.connection.db.dropDatabase();
            console.log('🗑️  Database reset for development');
        } catch (error) {
            console.log('ℹ️  Could not reset database:', error.message);
        }
    }
};

module.exports = { connectDB, resetDatabase };
