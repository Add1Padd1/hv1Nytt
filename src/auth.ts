// src/auth.ts (Backend - Full File with Debug Logs)

import { Hono, type Context } from 'hono';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import dotenv from 'dotenv';
// Adjust path if index.ts is in parent dir: ../index.js
// If in same dir: ./index.js
import { cloudinary, isCloudinaryConfigured, streamifier } from './index.js';

dotenv.config();
const prisma = new PrismaClient();

// Ensure JWT_SECRET is loaded
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error("FATAL ERROR: JWT_SECRET is not defined in the environment variables.");
  process.exit(1); // Exit if secret is missing
}
const tokenLifetime = parseInt(process.env.TOKEN_LIFETIME || '3600', 10);


interface UserJWTPayload { id: number; username: string; admin: boolean; }
export interface AuthVariables { user?: UserJWTPayload; }

export const authApp = new Hono<{ Variables: AuthVariables }>();

// Helper to find user by username (internal)
async function findUserByUsernameInternal(username: string): Promise<Prisma.users | null> {
  try {
      return await prisma.users.findUnique({ where: { username } });
  } catch (error) {
      console.error(`Error finding user by username (${username}):`, error);
      return null; // Return null on DB error during lookup
  }
}

// --- Auth Middleware with Debugging ---
export async function authMiddleware(
  c: Context<{ Variables: AuthVariables }>,
  next: () => Promise<void>
): Promise<Response | void> {
  console.log('[authMiddleware] Running for path:', c.req.path); // DEBUG Path
  let authHeader = c.req.header('Authorization') || c.req.header('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[authMiddleware] FAILED: No valid Bearer header.');
    return c.json({ error: 'Authorization header missing or invalid' }, 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, jwtSecret) as UserJWTPayload;
    console.log('[authMiddleware] Token decoded:', JSON.stringify(decoded));

    if (!decoded?.id || !decoded?.username) {
       console.error('[authMiddleware] FAILED: Invalid token payload structure:', decoded);
       return c.json({ error: 'Invalid token payload' }, 401);
    }

    const userDataToSet = {
        id: decoded.id,
        username: decoded.username,
        admin: decoded.admin ?? false
    };

    console.log('[authMiddleware] Setting user context:', JSON.stringify(userDataToSet));
    c.set('user', userDataToSet);

    const userAfterSet = c.get('user');
    console.log('[authMiddleware] c.get("user") immediately after set:', JSON.stringify(userAfterSet));

    console.log('[authMiddleware] Calling next()...');
    await next();
    console.log('[authMiddleware] next() finished.');
    return; // Explicit void return after next completes without returning Response
  } catch (error: any) {
    console.error("[authMiddleware] FAILED: Token verification error:", error.message);
    const errorMessage = error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return c.json({ error: errorMessage }, 401);
  }
}

// --- Admin Middleware with Debugging ---
export async function requireAdmin(
  c: Context<{ Variables: AuthVariables }>,
  next: () => Promise<void>
): Promise<Response | void> {
  console.log('[requireAdmin] Running for path:', c.req.path); // DEBUG Path

  const loggedInUser = c.get('user');
  console.log('[requireAdmin] c.get("user") value:', JSON.stringify(loggedInUser));

  if (!loggedInUser || !loggedInUser.admin) {
    if (!loggedInUser) console.warn('[requireAdmin] DENIED: Context "user" is undefined.');
    else if (!loggedInUser.admin) console.warn(`[requireAdmin] DENIED: User '${loggedInUser.username}' is not admin.`);
    else console.warn(`[requireAdmin] DENIED: Unknown reason. User: ${JSON.stringify(loggedInUser)}`);
    return c.json({ error: 'Forbidden: Administrator access required' }, 403);
  }

  console.log(`[requireAdmin] PASSED: User '${loggedInUser.username}' is admin. Calling next()...`);
  await next();
  console.log('[requireAdmin] next() finished.');
  return; // Explicit void return
}

// --- Routes defined on the NAMED 'authApp' instance ---

// Register Route - Does NOT use authMiddleware
authApp.post('/users/register', async (c) => {
  console.log("[Register Route] Received request"); // DEBUG
  let body: any;
  try {
      body = await c.req.json();
  } catch (e) {
      console.log("[Register Route] FAILED: Invalid JSON");
      return c.json({ error: 'Invalid JSON body' }, 400);
  }
  console.log("[Register Route] Request body:", body); // DEBUG

  const RegisterSchema = z.object({
      username: z.string().min(3, "Username >= 3 chars"),
      email: z.string().email("Invalid email"),
      password: z.string().min(8, "Password >= 8 chars"),
  });
  const validation = RegisterSchema.safeParse(body);
  if (!validation.success) {
      console.log("[Register Route] FAILED: Zod validation", validation.error.flatten()); // DEBUG
      return c.json({ error: 'Invalid registration data', details: validation.error.flatten() }, 400);
  }

  const { username, email, password } = validation.data;
  console.log(`[Register Route] Attempting to register: ${username}, ${email}`); // DEBUG

  try {
     const existingUser = await prisma.users.findFirst({ where: { OR: [{ username }, { email }] } });
     if (existingUser) {
        console.log(`[Register Route] FAILED: User/Email exists for ${username}/${email}`); // DEBUG
        return c.json({ error: 'Username or email already exists' }, 409);
     }
     console.log(`[Register Route] Username/Email check passed for ${username}`); // DEBUG

    const hashedPassword = await bcrypt.hash(password, 10);
    console.log(`[Register Route] Password hashed for ${username}`); // DEBUG

    // Generate a simple slug (ensure it's unique in the schema)
    const slug = username.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now(); // Example slug
    console.log(`[Register Route] Generated slug: ${slug}`);

    console.log(`[Register Route] Calling prisma.users.create for ${username}...`); // DEBUG
    const user = await prisma.users.create({
      data: { username, email, password: hashedPassword, admin: false, slug: slug },
    });
    console.log(`[Register Route] SUCCESS: User ${user.username} created with ID ${user.id}`); // DEBUG

    const { password: _p, ...rest } = user;
    return c.json({ ...rest, admin: rest.admin ?? false }, 201); // 201 Created

  } catch (error: any) {
    console.error("[Register Route] FAILED: DB/Bcrypt error:", error); // DEBUG
     if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const target = (error.meta as any)?.target ?? ['field'];
          return c.json({ error: `Field already exists: ${Array.isArray(target) ? target.join(', ') : target}` }, 409);
     }
    // Ensure a generic error message is sent, not "Invalid credentials"
    return c.json({ error: 'Registration failed due to server error' }, 500);
  }
});

// Login Route - Does NOT use authMiddleware initially
authApp.post('/users/login', async (c) => {
  console.log("[Login Route] Received request"); // DEBUG
  const { username, password } = await c.req.json().catch(() => ({}));
  if (!username || !password) {
      console.log("[Login Route] FAILED: Missing username or password"); // DEBUG
      return c.json({ error: 'Username and password required' }, 400);
  }

  const user = await findUserByUsernameInternal(username);
  if (!user) {
      console.log(`[Login Route] FAILED: User ${username} not found`); // DEBUG
      return c.json({ error: 'Invalid credentials' }, 401);
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
      console.log(`[Login Route] FAILED: Incorrect password for ${username}`); // DEBUG
      return c.json({ error: 'Invalid credentials' }, 401);
  }

  console.log(`[Login Route] SUCCESS: Credentials valid for ${username}`); // DEBUG
  const payload: UserJWTPayload = { id: user.id, username: user.username, admin: user.admin ?? false };
  const token = jwt.sign(payload, jwtSecret, { expiresIn: tokenLifetime });
  const { password: _p, ...rest } = user;
  return c.json({ user: { ...rest, admin: rest.admin ?? false }, token, expiresIn: tokenLifetime });
});

// Current User Route - USES authMiddleware
authApp.get('/users/me', authMiddleware, async (c) => {
  const user = c.get('user'); // Should be set by authMiddleware
  console.log("[/users/me Route] User context:", JSON.stringify(user)); // DEBUG
  if (!user) return c.json({ error: 'Not authenticated (unexpected)' }, 401); // Should be caught by middleware

  const dbUser = await prisma.users.findUnique({
    where: { id: user.id },
    select: { id: true, username: true, email: true, admin: true, created: true, slug: true }
  });
  if (!dbUser) {
      console.error(`[/users/me Route] User ID ${user.id} not found in DB.`);
      return c.json({ error: 'User not found' }, 404);
  }
  console.log("[/users/me Route] Returning user data"); // DEBUG
  return c.json({ ...dbUser, admin: dbUser.admin ?? false });
});

// ROUTE: Get latest profile picture - USES authMiddleware
authApp.get('/users/me/profile-picture', authMiddleware, async (c) => {
    const user = c.get('user'); // Should be set
    console.log("[/users/me/profile-picture Route] User context:", JSON.stringify(user)); // DEBUG
    if (!user) return c.json({ error: 'Not authenticated (unexpected)' }, 401);

    console.log(`Fetching latest profile picture for user ID: ${user.id}`);
    try {
        if (!prisma.image) { throw new Error("Prisma model 'image' not found."); }
        const latestImage = await prisma.image.findFirst({ where: { user_id: user.id }, orderBy: { created: 'desc' }, select: { image_url: true } });
        if (latestImage?.image_url) { return c.json({ profilePictureUrl: latestImage.image_url }); }
        else { return c.json({ profilePictureUrl: null }); }
    } catch (error) { console.error(`Error fetching profile picture for user ${user.id}:`, error); return c.json({ error: 'Failed to retrieve profile picture' }, 500); }
});

// Cloudinary Upload Route (Using Unsigned Preset) - USES authMiddleware
authApp.post('/images/upload', authMiddleware, async (c) => {
  console.log("[/images/upload Route] Received request"); // DEBUG
  if (!isCloudinaryConfigured) { console.error("Cloudinary config missing."); return c.json({ error: 'Image service misconfigured.' }, 503); }
  const userData = c.get('user'); // Should be set
  if (!userData) return c.json({ error: 'User not authenticated (unexpected)' }, 401);

  let formData; try { formData = await c.req.formData(); } catch (e) { return c.json({ error: 'Invalid form data.' }, 400); }
  const file = formData.get('file'); const caption = formData.get('caption') as string | null;
  if (!file || !(file instanceof Blob) || file.size === 0) return c.json({ error: 'No valid file provided.' }, 400);
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (!allowedMimeTypes.includes(file.type)) return c.json({ error: `Invalid file type. Only ${allowedMimeTypes.join(', ')} allowed.` }, 400);
  let buffer: Buffer; try { buffer = Buffer.from(await file.arrayBuffer()); } catch (e) { return c.json({ error: 'Could not process file.' }, 500); }

  const UPLOAD_PRESET_NAME = 'luz8lu6b'; // Your unsigned preset name
  let uploadResult: any;
  try {
    console.log(`Attempting UNSIGNED upload preset ${UPLOAD_PRESET_NAME} for user ${userData.id}...`);
    uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream({ resource_type: 'auto', upload_preset: UPLOAD_PRESET_NAME }, (error, result) => {
        if (error) { console.error('Cloudinary SDK error (unsigned):', error); reject({ message: error.message || 'Cloudinary upload failed.', http_code: error.http_code || 500, details: error }); }
        else if (result) { console.log(`Cloudinary UNSIGNED upload OK: ${result.public_id}`); resolve(result); }
        else { reject({ message: 'Cloudinary SDK empty response.', http_code: 500 }); } });
      streamifier.createReadStream(buffer).pipe(uploadStream); });
  } catch (error: any) { console.error('Cloudinary upload promise error (unsigned):', error); return c.json({ error: `Upload failed: ${error.message || 'Unknown'}` }, error.http_code || 500); }
  // Save to Database
  try {
     if (!prisma.image) throw new Error("Prisma 'image' model not found.");
     const newImage = await prisma.image.create({ data: { user_id: userData.id, image_url: uploadResult.secure_url, public_id: uploadResult.public_id, caption: caption || null }, });
     console.log(`Image record created: ${newImage.public_id}`);
    return c.json({ message: "Upload successful", imageUrl: newImage.image_url, imageId: newImage.id }, 201);
  } catch (dbError: any) {
    console.error('DB error saving image info:', dbError); try { await cloudinary.uploader.destroy(uploadResult.public_id); } catch (delErr) { /* ignore cleanup */ }
     if (dbError instanceof Prisma.PrismaClientKnownRequestError && dbError.code === 'P2002') return c.json({ error: 'Failed to save: Duplicate entry.' }, 409);
     if (dbError.message.includes("'image' not found")) return c.json({ error: 'Server config error saving image.'}, 500);
    return c.json({ error: 'Image uploaded but failed to save info.' }, 500);
  }
});

// Get Images Route - USES authMiddleware
authApp.get('/images', authMiddleware, async (c) => {
  const user = c.get('user'); // Should be set
  console.log("[/images Route] User context:", JSON.stringify(user)); // DEBUG
  if (!user) return c.json({ error: 'User not authenticated (unexpected)' }, 401);
  if (!prisma.image) return c.json({ error: 'Image service config error.' }, 500);
  try {
    const images = await prisma.image.findMany({ where: { user_id: user.id }, orderBy: { created: 'desc' }, select: { id: true, image_url: true, caption: true, created: true, public_id: true } });
    console.log(`[/images Route] Found ${images.length} images for user ${user.id}`); // DEBUG
    return c.json(images);
  } catch (error) { console.error("Could not retrieve user images:", error); return c.json({ error: 'Failed to retrieve images' }, 500); }
});