import Redis from "ioredis";

if (!process.env.REDIS_URI) {
	throw new Error("REDIS_URI is not defined");
}

export const redis = new Redis(process.env.REDIS_URI);
