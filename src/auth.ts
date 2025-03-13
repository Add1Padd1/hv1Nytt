import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

// passar að jwt örg til
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET must be defined in the .env file');
}
const tokenLifetime = parseInt(process.env.TOKEN_LIFETIME || '3600', 10);

const prisma = new PrismaClient();

interface AuthState extends Record<string, unknown> {
  user?: {
    id: number;
    username: string;
    admin: boolean;
  };
}

const auth = new Hono<{}, AuthState>();

const UserSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string(),
  password: z.string(),
  admin: z.boolean().optional(),
});
type User = z.infer<typeof UserSchema>;

// find user by username
async function findUserByUsername(username: string): Promise<User | null> {
  const user = await prisma.users.findUnique({
    where: { username },
  });
  if (user) {
    return { ...user, admin: user.admin ?? false } as User;
  }
  return null;
}

// jwt verify
export async function authMiddleware(
  c: any,
  next: () => Promise<void>
): Promise<Response> {
  const authHeader = c.req.headers.get('Authorization');
  if (!authHeader) {
    return c.json({ error: 'Authorization header missing' }, 401);
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, jwtSecret) as AuthState['user'];
    c.set('user', decoded);
    await next();
    return c.res;
  } catch (error) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}

// admin middleware
export async function requireAdmin(
  c: any,
  next: () => Promise<void>
): Promise<Response> {
  await authMiddleware(c, async () => {}); // Ensure the token is valid.
  const userData = (c.req.user as AuthState['user']) || c.get('user');
  if (!userData || !userData.admin) {
    return c.json({ error: 'Insufficient authorization' }, 401);
  }
  return next();
}

// register
auth.post('/users/register', async (c) => {
  const { username, email, password } = await c.req.json();
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.users.create({
      data: {
        username,
        email,
        password: hashedPassword,
        admin: false, // ekki admin by default
      },
    });
    // fela password
    const { password: _pwd, ...userWithoutPassword } = user;
    return c.json(userWithoutPassword, 201);
  } catch (error) {
    return c.json({ error: 'Registration failed' }, 400);
  }
});

// login
auth.post('/users/login', async (c) => {
  const { username, password } = await c.req.json();
  const user = await findUserByUsername(username);
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  // jwt buið til
  const payload = { id: user.id, username: user.username, admin: user.admin };
  const token = jwt.sign(payload, jwtSecret, { expiresIn: tokenLifetime });
  const { password: _pwd, ...userWithoutPassword } = user;
  return c.json({ user: userWithoutPassword, token, expiresIn: tokenLifetime });
});

// current user
auth.get('/users/me', authMiddleware, async (c) => {
  const userData = c.get('user') as AuthState['user'];
  if (!userData) {
    return c.json({ error: 'User not found' }, 404);
  }
  const user = await prisma.users.findUnique({ where: { id: userData.id } });
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }
  const { password: _pwd, ...userWithoutPassword } = user;
  return c.json(userWithoutPassword);
});

export default auth;
