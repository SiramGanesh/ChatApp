import mongoose from "mongoose";

export async function connectDB(){
    try {
        const mongoUri = process.env.MONGO_URL;

        if (!mongoUri) {
            throw new Error("MONGO_URL is not defined in the environment variables.");
        }

        const conn = await mongoose.connect(mongoUri);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

export default connectDB;