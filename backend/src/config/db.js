import mongoose from "mongoose";

const dbConnect = () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ [MongoDB Error]: Neither MONGO_URI nor MONGODB_URI is defined!");
    return Promise.reject(new Error("No MongoDB URI defined"));
  }
  return mongoose.connect(uri).then(() => {
    console.log("✅ Connected to MongoDB Database:", mongoose.connection.db?.databaseName || "connected");
  }).catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
  });
};

export default dbConnect;