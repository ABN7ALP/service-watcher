// db.js
const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_URI;
if (!uri) {
    throw new Error("MONGO_URI is not defined in environment variables. Please add it to your .env file.");
}

const client = new MongoClient(uri);
let db;

async function connectDB() {
    if (db) return db; // إذا كان متصلاً بالفعل، قم بإرجاع الاتصال
    try {
        await client.connect();
        console.log("✔️ Connected to MongoDB successfully!");
        db = client.db("wheel-of-fortune-db"); // يمكنك اختيار أي اسم لقاعدة البيانات
        return db;
    } catch (err) {
        console.error("Failed to connect to MongoDB", err);
        throw err; // رمي الخطأ ليتم التعامل معه في server.js
    }
}

module.exports = connectDB;
