// src/auth.ts

import { Hono, type Context } from 'hono'; // Use type Context
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import dotenv from 'dotenv';
// Ensure path is correct (e.g., if index.ts is in the same directory)
import { cloudinary, isCloudinaryConfigured, streamifier } from './index.js';

dotenv.config();
const prisma = new PrismaClient();

// Use non-null assertion '!' if you are sure JWT_SECRET is set via .env
// Otherwise, keep the check.
const jwtSecret = process.env.JWT_SECRET!;
const tokenLifetime = parseInt(process.env.TOKEN_LIFETIME || '3600', 10);
if (!jwtSecret) {
  // This check might be redundant if using '!' above, but safe to keep.
  throw new Error('JWT_SECRET must be defined in the .env file');
}

// Type definitions
interface UserJWTPayload {
  id: number;
  username: string;
  admin: boolean;
}
export interface AuthVariables { // Export this interface
  user?: UserJWTPayload;
}

// --- USE NAMED EXPORT for the Hono app instance ---
export const authApp = new Hono<{ Variables: AuthVariables }>();

// Helper to find user (internal)
async function findUserByUsernameInternal(username: string): Promise<Prisma.users | null> {
  const user = await prisma.users.findUnique({
    where: { username },
  });
  return user;
}

// Auth Middleware (KEEP named export)
export async function authMiddleware(
  c: Context<{ Variables: AuthVariables }>,
  next: () => Promise<void>
): Promise<Response | void> {
  let authHeader: string | undefined | null = null;
  authHeader = c.req.header('Authorization') || c.req.header('authorization');

  console.log('Authorization header:', authHeader?.substring(0, 15) + '...'); // Log prefix only

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Authorization header missing or invalid' }, 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, jwtSecret) as UserJWTPayload;
    if (!decoded?.id || !decoded?.username) throw new Error("Invalid payload structure");
    c.set('user', { id: decoded.id, username: decoded.username, admin: decoded.admin ?? false });
    await next(); return;
  } catch (error: any) {
    console.error("Token verification failed:", error.message);
    const errorMessage = error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return c.json({ error: errorMessage }, 401);
  }
}

// Admin Middleware (KEEP named export)
export async function requireAdmin(
  c: Context<{ Variables: AuthVariables }>,
  next: () => Promise<void>
): Promise<Response | void> {
  const loggedInUser = c.get('user');
  if (!loggedInUser || !loggedInUser.admin) {
    console.warn(`Admin access denied for user: ${loggedInUser?.username ?? 'Unknown'}`);
    return c.json({ error: 'Forbidden: Administrator access required' }, 403);
  }
  await next(); return;
}

// --- Define Routes on the NAMED 'authApp' instance ---

// Register Route
authApp.post('/users/register', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON body' }, 400);

  const RegisterSchema = z.object({
      username: z.string().min(3, "Username >= 3 chars"),
      email: z.string().email("Invalid email"),
      password: z.string().min(8, "Password >= 8 chars"),
  });
  const validation = RegisterSchema.safeParse(body);
  if (!validation.success) return c.json({ error: 'Invalid registration data', details: validation.error.flatten() }, 400);

  const { username, email, password } = validation.data;
  try {
    const existingUser = await prisma.users.findFirst({ where: { OR: [{ username }, { email }] } });
    if (existingUser) return c.json({ error: 'Username or email already exists' }, 409);

    const hashedPassword = await bcrypt.hash(password, 10);
    // Ensure slug field is defined in schema and provided
    const user = await prisma.users.create({
      data: { username, email, password: hashedPassword, admin: false, slug: username }, // Using username as slug
    });
    const { password: _p, ...rest } = user;
    return c.json({ ...rest, admin: rest.admin ?? false }, 201);

  } catch (error: any) {
    console.error("Registration failed:", error);
     if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const target = (error.meta as any)?.target ?? ['field'];
          return c.json({ error: `Field already exists: ${Array.isArray(target) ? target.join(', ') : target}` }, 409);
     }
    return c.json({ error: 'Registration failed due to server error' }, 500);
  }
});

// Login Route
authApp.post('/users/login', async (c) => {
  const { username, password } = await c.req.json().catch(() => ({}));
  if (!username || !password) return c.json({ error: 'Username and password required' }, 400);

  const user = await findUserByUsernameInternal(username);
  if (!user) {
      console.log(`Login failed for username: ${username} (not found)`); // Log failure reason
      return c.json({ error: 'Invalid credentials' }, 401);
  }
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
      console.log(`Login failed for username: ${username} (wrong password)`); // Log failure reason
      return c.json({ error: 'Invalid credentials' }, 401);
  }

  const payload: UserJWTPayload = { id: user.id, username: user.username, admin: user.admin ?? false };
  const token = jwt.sign(payload, jwtSecret, { expiresIn: tokenLifetime });
  const { password: _p, ...rest } = user;
  return c.json({ user: { ...rest, admin: rest.admin ?? false }, token, expiresIn: tokenLifetime });
});

// Current User Route
authApp.get('/users/me', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Not authenticated' }, 401);

  const dbUser = await prisma.users.findUnique({
    where: { id: user.id },
    select: { id: true, username: true, email: true, admin: true, created: true, slug: true }
  });
  if (!dbUser) {
      console.error(`User ID ${user.id} from token not found in DB.`);
      return c.json({ error: 'User not found' }, 404);
  }
  return c.json({ ...dbUser, admin: dbUser.admin ?? false });
});

// --- ROUTE: Get latest profile picture ---
authApp.get('/users/me/profile-picture', authMiddleware, async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Not authenticated' }, 401);

    console.log(`Fetching latest profile picture for user ID: ${user.id}`);
    try {
        // Defensive check for image model existence
        if (!prisma.image) {
             console.error("Prisma model 'image' not found. Schema generation might be needed.");
             return c.json({ error: 'Server configuration error getting profile picture.' }, 500);
        }
        // Find the most recently created image for this user
        const latestImage = await prisma.image.findFirst({
            where: { user_id: user.id },
            orderBy: { created: 'desc' }, // Order by creation date descending
            select: { image_url: true }    // Only select the URL
        });

        if (latestImage && latestImage.image_url) {
            console.log(`Found profile picture URL: ${latestImage.image_url}`);
            return c.json({ profilePictureUrl: latestImage.image_url }); // Return URL
        } else {
            console.log(`No profile picture found for user ID: ${user.id}`);
            return c.json({ profilePictureUrl: null }); // Return null if none found (still 200 OK)
        }
    } catch (error) {
        console.error(`Error fetching profile picture for user ${user.id}:`, error);
        return c.json({ error: 'Failed to retrieve profile picture' }, 500);
    }
});
// --- END OF PROFILE PICTURE ROUTE ---

// Cloudinary Upload Route (Using Unsigned Preset)
authApp.post('/images/upload', authMiddleware, async (c) => {
  // Check if Cloudinary config (at least cloud_name) is loaded
  if (!isCloudinaryConfigured) {
    console.error("Cloudinary config (cloud_name) missing. Cannot upload.");
    return c.json({ error: 'Image upload service misconfigured.' }, 503);
  }
  const userData = c.get('user');
  if (!userData) return c.json({ error: 'User not authenticated' }, 401);

  let formData;
  try { formData = await c.req.formData(); }
  catch (e) { return c.json({ error: 'Invalid form data.' }, 400); }

  const file = formData.get('file');
  const caption = formData.get('caption') as string | null;
  if (!file || !(file instanceof Blob) || file.size === 0) return c.json({ error: 'No valid file provided.' }, 400);

  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (!allowedMimeTypes.includes(file.type)) return c.json({ error: `Invalid file type. Only ${allowedMimeTypes.join(', ')} allowed.` }, 400);

  let buffer: Buffer;
  try { buffer = Buffer.from(await file.arrayBuffer()); }
  catch (e) { return c.json({ error: 'Could not process file.' }, 500); }

  const UPLOAD_PRESET_NAME = 'luz8lu6b'; // Your unsigned preset name
  let uploadResult: any;
  try {
    console.log(`Attempting UNSIGNED upload using preset ${UPLOAD_PRESET_NAME} for user ${userData.id}...`);
    uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: 'auto', upload_preset: UPLOAD_PRESET_NAME },
        (error, result) => {
          if (error) { console.error('Cloudinary SDK upload error (unsigned):', error); reject({ message: error.message || 'Cloudinary upload failed.', http_code: error.http_code || 500, details: error }); }
          else if (result) { console.log(`Cloudinary UNSIGNED upload successful: ${result.public_id}`); resolve(result); }
          else { reject({ message: 'Cloudinary SDK returned empty response.', http_code: 500 }); }
        }
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  } catch (error: any) {
    console.error('Error during Cloudinary upload promise (unsigned):', error);
    return c.json({ error: `Upload failed: ${error.message || 'Unknown Cloudinary error'}` }, error.http_code || 500);
  }

  // Save to Database
  try {
     if (!prisma.image) throw new Error("Prisma model 'image' not found.");
     // Ensure public_id is unique in schema if saving it
     const newImage = await prisma.image.create({
      data: { user_id: userData.id, image_url: uploadResult.secure_url, public_id: uploadResult.public_id, caption: caption || null },
    });
     console.log(`Image record created: ${newImage.public_id}`);
    return c.json({ message: "Upload successful", imageUrl: newImage.image_url, imageId: newImage.id }, 201);
  } catch (dbError: any) {
    console.error('DB error saving image info:', dbError);
    try { await cloudinary.uploader.destroy(uploadResult.public_id); } catch (delErr) { /* ignore cleanup error */ }
     if (dbError instanceof Prisma.PrismaClientKnownRequestError && dbError.code === 'P2002') return c.json({ error: 'Failed to save image info: Duplicate entry.' }, 409);
     if (dbError.message.includes("'image' not found")) return c.json({ error: 'Server config error saving image.'}, 500);
    return c.json({ error: 'Image uploaded but failed to save info.' }, 500);
  }
});

// Get Images Route
authApp.get('/images', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'User not authenticated' }, 401);
  if (!prisma.image) return c.json({ error: 'Image service config error.' }, 500);
  try {
    const images = await prisma.image.findMany({
      where: { user_id: user.id },
      orderBy: { created: 'desc' },
      select: { id: true, image_url: true, caption: true, created: true, public_id: true }
    });
    return c.json(images);
  } catch (error) {
    console.error("Could not retrieve user images:", error);
    return c.json({ error: 'Failed to retrieve images' }, 500);
  }
});

// --- NO default export ---