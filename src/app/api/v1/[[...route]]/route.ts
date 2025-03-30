import { Hono, Context } from 'hono'
import { handle } from 'hono/vercel'
import testRoute from '../_routes/test.route'

export const runtime = 'nodejs'

const app = new Hono().basePath('/api/v1')

app.route("/test", testRoute)

export const GET = handle(app)
export const POST = handle(app)