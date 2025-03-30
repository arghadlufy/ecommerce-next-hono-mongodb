import { Hono, Context } from "hono";
import { validator } from "hono/validator";
import authValidationSchema from "@/lib/validation-schema/signup.schema";
import db from "@/lib/database/db";
import User from "@/lib/database/model/user.model";
import generateToken from "@/lib/database/utils/generate-token";
import {
	deleteAllRefreshTokens,
	getStoredTokenFromRedis,
	storeRefreshToken,
} from "@/lib/database/utils/store-refresh-token";
import jwt from "jsonwebtoken";
import { setSignedCookie, getSignedCookie, deleteCookie, setCookie, getCookie } from "hono/cookie";
import { JWTPayload } from "@/types";
import { redis } from "@/lib/database/redis";

const authRoute = new Hono();

authRoute.post(
	"/signup",
	validator("json", (value, c) => {
		const parsed = authValidationSchema.signupSchema.safeParse(value);
		if (!parsed.success) {
			return c.text(parsed.error.message, 400);
		}
		return parsed.data;
	}),
	async (c) => {
		try {
			await db();
			const { email, password, name } = c.req.valid("json");
			const headers = c.req.header();
			const deviceId = headers["x-device-id"];

			const userExists = await User.findOne({ email });
			if (userExists) {
				return c.json(
					{
						message: "User already exists",
					},
					400,
				);
			}

			const user = await User.create({ email, password, name });

			// authenticate
			const { accessToken, refreshToken } = generateToken(user._id);

			await storeRefreshToken(user._id, refreshToken, deviceId);

			if (process.env.ACCESS_TOKEN_SECRET && process.env.REFRESH_TOKEN_SECRET) {
				// Access Token
				setCookie(
					c,
					"access_token",
					accessToken,
					{
						path: "/",
						secure: process.env.NODE_ENV === "production",
						httpOnly: true,
						maxAge: 15 * 60, // 15 minutes
						expires: new Date(Date.now() + 15 * 60 * 1000),
						sameSite: "Strict", // Strict, Lax, None
					},
				);

				// Refresh Token
				setCookie(
					c,
					"refresh_token",
					refreshToken,
					{
						path: "/",
						secure: process.env.NODE_ENV === "production",
						httpOnly: true,
						maxAge: 60 * 60 * 24 * 7, // 7 days
						expires: new Date(Date.now() + 60 * 60 * 24 * 7 * 1000),
						sameSite: "Strict", // Strict, Lax, None
					},
				);
			} else {
				return c.json(
					{
						message: "Internal server error. Signed cookie secret is not set",
					},
					500,
				);
			}

			return c.json(
				{
					message: "User created successfully",
					user: {
						_id: user._id,
						name: user.name,
						email: user.email,
						role: user.role,
					},
				},
				201,
			);
		} catch (error: any) {
			return c.json(
				{
					message: "Internal server error",
					error,
				},
				500,
			);
		}
	},
);

authRoute.post(
	"/login",
	validator("json", (value, c) => {
		const parsed = authValidationSchema.loginSchema.safeParse(value);
		if (!parsed.success) {
			return c.text(parsed.error.message, 400);
		}
		return parsed.data;
	}),
	async (c) => {
		try {
			const { email, password } = c.req.valid("json");
			const headers = c.req.header();
			const deviceId = headers["x-device-id"];
			const user = await User.findOne({ email });
			if (!user) {
				return c.json(
					{
						message: "Invalid email or password",
					},
					401,
				);
			}

			const isPasswordValid = await user.comparePassword(password);
			if (!isPasswordValid) {
				return c.json(
					{
						message: "Invalid email or password",
					},
					401,
				);
			}

			const { accessToken, refreshToken } = generateToken(user._id);

			// store refresh token in redis
			await storeRefreshToken(user._id, refreshToken, deviceId);

			if (process.env.ACCESS_TOKEN_SECRET && process.env.REFRESH_TOKEN_SECRET) {
				// Access Token
				setCookie(
					c,
					"access_token",
					accessToken,
					{
						path: "/",
						secure: process.env.NODE_ENV === "production",
						httpOnly: true,
						maxAge: 15 * 60, // 15 minutes
						expires: new Date(Date.now() + 15 * 60 * 1000),
						sameSite: "Strict", // Strict, Lax, None
					},
				);

				// Refresh Token
				setCookie(
					c,
					"refresh_token",
					refreshToken,
					{
						path: "/",
						secure: process.env.NODE_ENV === "production",
						httpOnly: true,
						maxAge: 60 * 60 * 24 * 7, // 7 days
						expires: new Date(Date.now() + 60 * 60 * 24 * 7 * 1000),
						sameSite: "Strict", // Strict, Lax, None
					},
				);
			} else {
				return c.json(
					{
						message: "Internal server error. Signed cookie secret is not set",
					},
					500,
				);
			}

			return c.json({
				message: "Login successful",
				user: {
					_id: user._id,
					name: user.name,
					email: user.email,
					role: user.role,
				},
			});
		} catch (error) {}
	},
);

authRoute.get("/logout", async (c: Context) => {
	try {
		const headers = c.req.header();
		const deviceId = headers["x-device-id"];
		const refreshToken = getCookie(c, "refresh_token");

		if (refreshToken && process.env.REFRESH_TOKEN_SECRET) {
			const decoded = jwt.verify(
				refreshToken,
				process.env.REFRESH_TOKEN_SECRET,
			) as JWTPayload;
			await deleteAllRefreshTokens(decoded.userId);
		}

		// delete all cookies
		deleteCookie(c, "access_token");
		deleteCookie(c, "refresh_token");

		return c.json({
			message: "Logout successful",
		});
	} catch (error: any) {
		return c.json(
			{
				message: "Internal server error",
			},
			500,
		);
	}
});

// return the access token (if it's expired using refresh token)
authRoute.get("/refresh-token", async (c) => {
	try {
		const headers = c.req.header();
		const deviceId = headers["x-device-id"];
		const secret = process.env.REFRESH_TOKEN_SECRET as string;
		const refreshToken = getCookie(c, "refresh_token");

		if (!refreshToken) {
			return c.json({
				message: "Refresh token not found",
			}, 401);
		}
		
		const decoded = jwt.verify(refreshToken, secret) as JWTPayload;
		const storedToken = await getStoredTokenFromRedis(decoded.userId, deviceId);
		if (storedToken !== refreshToken) {
			return c.json({
				message: "Invalid refresh token",
			}, 401);
		}

		const { accessToken } = generateToken(decoded.userId);

		setSignedCookie(c, "access_token", accessToken, secret, {
			path: "/",
			secure: process.env.NODE_ENV === "production",
			httpOnly: true,
			maxAge: 15 * 60, // 15 minutes
			expires: new Date(Date.now() + 15 * 60 * 1000),
		});

		return c.json({
			message: "Access token refreshed",
		}, 200);
	} catch (error) {
		return c.json({
			message: "Internal server error",
		}, 500);
	}
})

export default authRoute;
