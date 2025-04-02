import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';

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
  next: () => Promise<Response>
): Promise<Response> {
  let authHeader: string | undefined = undefined;

  // First, try the standard Headers interface (if available)
  if (c.req.headers && typeof c.req.headers.get === 'function') {
    authHeader =
      c.req.headers.get('Authorization') || c.req.headers.get('authorization');
  }

  // Fallback: try to use raw headers
  if (!authHeader && c.req.raw && c.req.raw.headers) {
    // If raw headers support a .get() method, use it
    if (typeof c.req.raw.headers.get === 'function') {
      authHeader =
        c.req.raw.headers.get('Authorization') ||
        c.req.raw.headers.get('authorization');
    } else if (typeof c.req.raw.headers === 'object') {
      // Otherwise, treat it as a plain object
      authHeader =
        c.req.raw.headers['authorization'] ||
        c.req.raw.headers['Authorization'];
    }
  }

  console.log('Authorization header from request:', authHeader);

  if (!authHeader) {
    return c.json({ error: 'Authorization header missing' }, 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, jwtSecret) as {
      id: number;
      username: string;
      admin: boolean;
    };
    c.set('user', decoded);
    return next();
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

// cloudinary auth hlutinn, þannig að upload og hægt að sjá myndir. og notednur geta bara séð sitt eigið dæmi
auth.post('/images/upload', authMiddleware, async (c) => {
  const userData = c.get('user') as {
    id: number;
    username: string;
    admin: boolean;
  };
  if (!userData) {
    return c.json({ error: 'User not authenticated' }, 401);
  }

  const formData = await c.req.formData();
  const file = formData.get('file');
  const caption = formData.get('caption') as string | null;

  if (!file) {
    return c.json({ error: 'No file provided' }, 400);
  }

  // MIME ----- only allow jpg and png
  const allowedMimeTypes = ['image/jpeg', 'image/png'];
  const fileType = (file as File).type;
  if (!allowedMimeTypes.includes(fileType)) {
    return c.json({ error: 'Only JPG and PNG images are allowed' }, 400);
  }

  const arrayBuffer = await (file as Blob).arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Upload the file to Cloudinary
  let uploadResult;
  try {
    uploadResult = await new Promise<{ secure_url: string }>(
      (resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          (error, result) => {
            if (error) {
              reject(error);
            } else if (result) {
              resolve(result);
            }
          }
        );
        uploadStream.end(buffer);
      }
    );
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }

  // Save the uploaded image info in the database, linked to the authenticated user
  try {
    const newImage = await prisma.image.create({
      data: {
        user_id: userData.id,
        image_url: uploadResult.secure_url,
        caption: caption || undefined,
      },
    });
    return c.json(newImage, 201);
  } catch (error) {
    return c.json({ error: 'Could not save image info to database' }, 500);
  }
});

// Only logged-in users can see their own images.
auth.get('/images', authMiddleware, async (c) => {
  const userData = c.get('user') as {
    id: number;
    username: string;
    admin: boolean;
  };
  if (!userData) {
    return c.json({ error: 'User not authenticated' }, 401);
  }

  try {
    const images = await prisma.image.findMany({
      where: { user_id: userData.id },
      orderBy: { created: 'desc' },
    });
    return c.json(images);
  } catch (error) {
    return c.json({ error: 'Could not retrieve images' }, 500);
  }
});

export default auth;
