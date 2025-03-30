import { redis } from "../redis";

const storeRefreshToken = async (
	userId: string,
	refreshToken: string,
	deviceId?: string,
) => {
	// If deviceId is provided, store as a specific session
	if (deviceId) {
		// Store token with device-specific key
		await redis.hset(`user_sessions:${userId}`, deviceId, refreshToken);
		// Set expiration for the entire hash
		await redis.expire(`user_sessions:${userId}`, 60 * 60 * 24 * 7); // 7 days
	} else {
		// Fallback to single session storage (backwards compatibility)
		await redis.set(
			`refresh_token:${userId}`,
			refreshToken,
			"EX",
			60 * 60 * 24 * 7,
		);
	}
};

// Add function to delete all sessions for a user
const deleteAllRefreshTokens = async (userId: string) => {
	await redis.del(`user_sessions:${userId}`);
	await redis.del(`refresh_token:${userId}`); // Clean up old format if exists
};

const getStoredTokenFromRedis = async (userId: string, deviceId?: string) => {
  if (deviceId) {
      // Get token for specific device
      const token = await redis.hget(`user_sessions:${userId}`, deviceId);
      return token;
  }
  // Fallback to single session storage
  const token = await redis.get(`refresh_token:${userId}`);
  return token;
};

export { storeRefreshToken, deleteAllRefreshTokens, getStoredTokenFromRedis };
