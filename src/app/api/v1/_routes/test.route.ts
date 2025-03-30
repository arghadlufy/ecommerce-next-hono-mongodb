import { Context, Hono } from "hono";

const testRoute = new Hono();

testRoute.get("/", (c: Context) => {
	return c.json({
		message: "Hello from test route",
	});
});

export default testRoute;