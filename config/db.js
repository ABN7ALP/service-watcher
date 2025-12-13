const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_URI;
if (!uri) {
    throw new Error("MONGO_URI is not defined in environment variables.");
}

const client = new MongoClient(uri);
let db;

async function connectDB() {
    if (db) return db;
    try {
        await client.connect();
        console.log("✔️  Connected to MongoDB successfully!");
        db = client.db("wheel_of_fortune_db"); // اسم قاعدة البيانات
        return db;
    } catch (err) {
        console.error("🔴 Failed to connect to MongoDB", err);
        process.exit(1); // إيقاف التطبيق إذا فشل الاتصال
    }
}

module.exports = connectDB;
