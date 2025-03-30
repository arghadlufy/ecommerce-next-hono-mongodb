import { Hono } from "hono";
import { handle } from "hono/vercel";
import { logger } from "hono/logger";
import testRoutes from "../_routes/test.routes";
import authRoutes from "../_routes/auth.routes";

export const runtime = "nodejs";

const app = new Hono().basePath("/api/v1");

app.use(logger());

app.route("/test", testRoutes);
app.route("/auth", authRoutes);

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);
