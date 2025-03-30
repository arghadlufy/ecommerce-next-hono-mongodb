import { Hono, Context } from "hono";
import { validator } from 'hono/validator'
import authValidationSchema from "@/lib/validation-schema/signup.schema";
import db from "@/lib/database/db";
import User from "@/lib/database/model/user.model";
const authRoute = new Hono();

authRoute.post(
	"/signup",
	validator("json", (value, c) => {
    const parsed = authValidationSchema.signupSchema.safeParse(value)
    if (!parsed.success) {
      return c.text(parsed.error.message, 400)
    }
    return parsed.data
  }),
	async (c) => {
		try {
			await db()
			const {email, password, name} = c.req.valid("json");
	
			const userExists = await User.findOne({ email });
			if (userExists) {
				return c.json({
					message: "User already exists",
				}, 400);
			}
	
			const user = await User.create({ email, password, name });
	
			return c.json({
				message: "User created successfully",
				user,
			});
		} catch (error) {
			return c.json({
				message: "Internal server error",
			}, 500);
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
