// src/index.ts

import { serve } from '@hono/node-server';
import { Hono } from 'hono'; // No need for Context import here usually
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { cors } from 'hono/cors';
import streamifier from 'streamifier';

// Import database functions
import {
  createTransaction, getTransactions, getTransaction,
  validateTransaction, // Keep validateTransaction
  getCategories, getAccounts, // Keep getAccounts for admin
  getUsersForAdminDropdown, getTransactionByUser, // Keep admin/user specific fetches
} from './categories.db.js';

// Import auth resources
import {
    authApp, // The Hono sub-app for /auth/* routes
    authMiddleware, // The authentication middleware
    requireAdmin, // The admin check middleware
    type AuthVariables // The type for Hono variables
} from './auth.js';

dotenv.config();
const prisma = new PrismaClient();

// --- Cloudinary Configuration ---
let isCloudinaryConfigured = false;
if (process.env.CLOUDINARY_URL) { try { const u = new URL(process.env.CLOUDINARY_URL); cloudinary.config({ cloud_name: u.hostname, api_key: u.username, api_secret: u.password, secure: true }); isCloudinaryConfigured = true; console.log(`Cloudinary OK: ${u.hostname}`); } catch(e) { console.error("Bad CLOUDINARY_URL");} } else { console.warn('CLOUDINARY_URL missing.'); }
export { cloudinary, isCloudinaryConfigured, streamifier }; // Export if needed by auth.ts

// --- Main Hono App Instance with Typing ---
const app = new Hono<{ Variables: AuthVariables }>();

// Apply CORS globally
app.use('*', cors());

// --- Root Route (Public) ---
app.get('/', (c) => c.json({ name: 'API V2', cloud: isCloudinaryConfigured?'OK':'Off' }));

// --- Mount Auth Routes (/auth/*) ---
// These handle their own auth/public status internally
app.route('/auth', authApp);

// === APPLICATION ROUTES ===

// --- Admin Routes ---
// Apply middleware directly to each route or use app.group

// Example: Applying individually
// GET All Accounts (Admin Only)
app.get('/admin/accounts', authMiddleware, requireAdmin, async (c) => {
    console.log(`Admin ${c.get('user')?.username} fetching all accounts.`); // User context should now be set
    try { return c.json(await getAccounts() ?? []); }
    catch (e) { console.error(`Admin accounts fetch error:`, e); return c.json({ error: "DB error" }, 500); }
});

// GET All Users (Admin Only)
app.get('/admin/users', authMiddleware, requireAdmin, async (c) => {
    console.log(`Admin ${c.get('user')?.username} fetching all users.`); // User context should now be set
    try { return c.json(await getUsersForAdminDropdown() ?? []); }
    catch (e) { console.error(`Admin users fetch error:`, e); return c.json({ error: "DB error" }, 500); }
});

// GET All Transactions (Admin Only) - Note: Uses /transactions path
app.get('/transactions', authMiddleware, requireAdmin, async (c) => {
     const user = c.get('user'); // User context should now be set
     const pageParam = c.req.query('page') ?? '0';
     let page: number; try { page = parseInt(pageParam); if(isNaN(page)||page<0) throw Error();} catch { return c.json({ error: 'Bad page' }, 400); }
     console.log(`Admin ${user?.username} fetching all tx page ${page}`);
     try { return c.json(await getTransactions(page) ?? []); }
     catch (e) { console.error("Admin tx fetch error:", e); return c.json({ error: 'DB error' }, 500); }
});
// --- End Admin Routes ---


// --- Standard User Routes ---

// GET My Accounts (Authenticated User)
app.get('/my-accounts', authMiddleware, async (c) => {
    const user = c.get('user'); // User context set by authMiddleware
    if (!user) return c.json({ error: 'Auth required (unexpected)' }, 401); // Should not happen
    console.log(`Fetching accounts for user ID: ${user.id}`);
    try {
        const accounts = await prisma.accounts.findMany({ where: { user_id: user.id }, select: { id: true, account_name: true, slug: true }, orderBy: { account_name: 'asc' } });
        return c.json(accounts);
    } catch (e) { console.error(`Error accounts user ${user.id}:`, e); return c.json({ error: 'DB error' }, 500); }
});

// GET Specific User's Transactions (Authenticated User or Admin)
app.get('/transactions/:username', authMiddleware, async (c) => {
    const loggedInUser = c.get('user'); // User context set by authMiddleware
    const targetUsername = c.req.param('username');
    if (!loggedInUser) return c.json({ error: 'Auth required (unexpected)' }, 401);

    // Authorization check
    if (loggedInUser.username !== targetUsername && !loggedInUser.admin) {
        return c.json({ error: 'Forbidden' }, 403);
    }
    if (!targetUsername || targetUsername.length > 100) return c.json({ message: 'Bad username' }, 400);

    try {
        const transactions = await getTransactionByUser(targetUsername);
        return c.json(transactions ?? []);
    } catch (e) { console.error(`Error tx user ${targetUsername}:`, e); return c.json({ error: 'DB error' }, 500); }
});

// POST Create Transaction (Authenticated User)
app.post('/transactions', authMiddleware, async (c) => {
    const loggedInUser = c.get('user'); // User context set by authMiddleware
    if (!loggedInUser) return c.json({ error: 'Auth required (unexpected)' }, 401);

    let reqBody: unknown; try { reqBody = await c.req.json(); } catch { return c.json({ error: 'Bad JSON' }, 400); }
    const validation = validateTransaction(reqBody); // Zod schema includes optional target_user_id
    if (!validation.success) { console.error("Zod validation failed:", validation.error.flatten()); return c.json({ error: 'Bad data', details: validation.error.flatten() }, 400); }

    const validatedData = validation.data;
    let finalUserId = loggedInUser.id; // Default to self
    let finalAccountId = validatedData.account_id;

    // Admin Override Logic
    if (loggedInUser.admin && validatedData.target_user_id) {
        finalUserId = validatedData.target_user_id;
         const targetUserExists = await prisma.users.findUnique({ where: { id: finalUserId }, select: { id: true } });
         if (!targetUserExists) return c.json({ error: 'Target user not found' }, 404);
         console.log(`Admin ${loggedInUser.username} creating tx for ${finalUserId}`);
         // Note: No account ownership check for admin posting for others
    } else {
         // Verify account ownership for non-admins or admin posting for self
         try {
             const account = await prisma.accounts.findUnique({ where: { id: finalAccountId, user_id: finalUserId } });
             if (!account) return c.json({ error: 'Bad account' }, 403);
         } catch { return c.json({ error: "DB error verifying account"}, 500); }
         console.log(`User ${loggedInUser.username} creating tx for self`);
    }

    const dataToCreate = { ...validatedData, user_id: finalUserId };
    try {
        const createdTx = await createTransaction(dataToCreate);
        return c.json(createdTx, 201);
    } catch (e) { console.error("Create Tx DB error:", e); return c.json({ error: 'DB error' }, 500); }
});
// --- End Standard User Routes ---


// --- Public Routes ---
app.get('/categories', async (c) => {
    try { return c.json(await getCategories() ?? []); }
    catch (e) { console.error("Error categories:", e); return c.json({ error: 'DB error' }, 500); }
});

// --- Start Server ---
const port = parseInt(process.env.PORT || '8000');
serve({ fetch: app.fetch, port }, (i) => { console.log(`Running at http://localhost:${i.port}`); if (!isCloudinaryConfigured) console.warn("Cloudinary OFF"); });