import { Hono, Context } from "hono";
import { validator } from "hono/validator";
import authValidationSchema from "@/lib/validation-schema/signup.schema";
import db from "@/lib/database/db";
import User from "@/lib/database/model/user.model";
import generateToken from "@/lib/database/utils/generate-token";
import { storeRefreshToken } from "@/lib/database/utils/store-refresh-token";
import { setSignedCookie } from "hono/cookie";

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

			if (process.env.SIGNED_COOKIE_SECRET) {
				// Access Token
				await setSignedCookie(
					c,
					"access_token",
					accessToken,
					process.env.SIGNED_COOKIE_SECRET,
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
				await setSignedCookie(
					c,
					"refresh_token",
					refreshToken,
					process.env.SIGNED_COOKIE_SECRET,
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

authRoute.get("/login", (c: Context) => {
	return c.json({
		message: "Login route",
	});
});

authRoute.get("/logout", (c: Context) => {
	return c.json({
		message: "Logout route",
	});
});

export default authRoute;
