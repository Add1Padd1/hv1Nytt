// src/index.ts

import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono'; // Use 'type Context'
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client'; // Import PrismaClient here
import { v2 as cloudinary } from 'cloudinary';
import { cors } from 'hono/cors';
import streamifier from 'streamifier';

// Import database functions (make sure path and extension are correct)
import {
  createTransaction, getTransactions, getTransaction,
  validateTransaction, validateUpdatedTransaction, deleteTransaction, updateTransaction,
  getCategories, getCategory, getBudgets, getBudget, getAccounts, getAccount,
  getPaymentMethods, getPaymentMethod, getUsers, getUser, getTransactionByUser,
} from './categories.db.js';

// Import auth functions and types using named imports
import {
    authApp, // Import the named Hono app instance
    authMiddleware,
    requireAdmin,
    type AuthVariables // Import the type using 'type'
} from './auth.js';

dotenv.config(); // Load environment variables

// Initialize Prisma Client here if not done elsewhere centrally
const prisma = new PrismaClient();

// --- Cloudinary Configuration ---
let isCloudinaryConfigured = false;
if (process.env.CLOUDINARY_URL) {
  try {
    const cloudinaryUrl = new URL(process.env.CLOUDINARY_URL);
    cloudinary.config({
      cloud_name: cloudinaryUrl.hostname,
      api_key: cloudinaryUrl.username,
      api_secret: cloudinaryUrl.password,
      secure: true,
    });
    isCloudinaryConfigured = true;
    console.log(`Cloudinary configured for cloud: ${cloudinary.config().cloud_name}`);
  } catch (error) {
     console.error("Failed to parse CLOUDINARY_URL:", error);
     console.error("Ensure format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME");
  }
} else {
  console.warn('CLOUDINARY_URL not found in .env file. Image uploads will fail.');
}
// Export config status if needed by other modules (like auth.ts)
export { cloudinary, isCloudinaryConfigured, streamifier };
// --- End Cloudinary Configuration ---


// --- Main Hono App Instance with Typing ---
const app = new Hono<{ Variables: AuthVariables }>();

// Apply CORS globally
app.use('*', cors());

// --- Root Route ---
app.get('/', (c) => {
    const data = {
        name: 'Transactions API V2',
        description: 'API to manage transactions and user data',
        _links: {
             self: { href: '/', method: 'GET' },
             auth: { href: '/auth', method: 'various' },
             transactions: { href: '/transactions', method: 'GET, POST' },
             categories: { href: '/categories', method: 'GET' },
             my_accounts: { href: '/my-accounts', method: 'GET (Auth Required)'},
         },
        cloudinary_status: isCloudinaryConfigured ? 'Configured' : 'Not Configured',
    };
    return c.json(data);
});


// --- Mount Auth Routes (handles /auth/*) ---
app.route('/auth', authApp);


// === APPLICATION ROUTES ===

// --- Accounts Routes ---

// Get ALL accounts (Admin only - example placement, could be separate file)
app.get('/accounts', requireAdmin, async (c) => {
  const user = c.get('user'); // Admin user details
  console.log(`Admin user ${user?.username} fetching all accounts.`);
  try {
      const accounts = await getAccounts(); // Assumes getAccounts fetches all
      return c.json(Array.isArray(accounts) ? accounts : []);
  } catch (dbError) {
      console.error(`Database error fetching all accounts:`, dbError);
      return c.json({ error: "Could not retrieve accounts" }, 500);
  }
});

// --- NEW: Get accounts for the currently logged-in user ---
app.get('/my-accounts', authMiddleware, async (c) => {
    const user = c.get('user');
    if (!user) {
        // Should be caught by middleware, but good practice
        return c.json({ error: 'Authentication required' }, 401);
    }

    console.log(`Fetching accounts for user ID: ${user.id}`);
    try {
        // Use Prisma directly here or call a specific db function if preferred
        const accounts = await prisma.accounts.findMany({
            where: { user_id: user.id },
            select: { // Select only fields needed by the frontend dropdown
                id: true,
                account_name: true,
                slug: true // Include slug if useful
            },
            orderBy: { account_name: 'asc' } // Optional ordering
        });
        console.log(`Found ${accounts.length} accounts for user ${user.id}`);
        return c.json(accounts); // Returns empty array [] if none found
    } catch (error) {
        console.error(`Error fetching accounts for user ${user.id}:`, error);
        return c.json({ error: 'Could not retrieve accounts' }, 500);
    }
});

// --- Transactions Routes ---

// Get User Transactions (Protected)
app.get('/transactions/:username', authMiddleware, async (c) => {
    const loggedInUser = c.get('user');
    const targetUsername = c.req.param('username');
    if (!loggedInUser) return c.json({ error: 'Authentication required' }, 401);

    // Authorization check
    if (loggedInUser.username !== targetUsername && !loggedInUser.admin) {
        return c.json({ error: 'Forbidden' }, 403);
    }
    if (!targetUsername || targetUsername.length > 100) {
        return c.json({ message: 'Invalid username parameter' }, 400);
    }
    try {
        console.log(`Fetching transactions for user: ${targetUsername} (req by ${loggedInUser.username})`);
        const transactions = await getTransactionByUser(targetUsername); // Assumes lookup by username
        return c.json(transactions ?? []);
    } catch (error) {
        console.error(`Error fetching transactions for ${targetUsername}:`, error);
        return c.json({ error: 'Failed to retrieve transactions' }, 500);
    }
});

// Get All Transactions (Admin Only)
app.get('/transactions', requireAdmin, async (c) => {
     const user = c.get('user');
     const pageParam = c.req.query('page') ?? '0';
     let page: number;
     try {
         page = parseInt(pageParam, 10);
         if (isNaN(page) || page < 0) throw new Error('Invalid page');
     } catch {
          return c.json({ error: 'Invalid page query parameter' }, 400);
     }
     console.log(`Admin ${user?.username} fetching all transactions page ${page}`);
     try {
         const transactions = await getTransactions(page); // Assumes pagination
         return c.json(transactions ?? []);
     } catch (error) {
         console.error("Error fetching all transactions:", error);
         return c.json({ error: 'Failed to retrieve transactions' }, 500);
     }
 });

// Create Transaction (Protected)
app.post('/transactions', authMiddleware, async (c) => {
    const loggedInUser = c.get('user');
    if (!loggedInUser) return c.json({ error: 'Authentication required' }, 401);

    let reqBody: unknown;
    try {
        reqBody = await c.req.json();
        console.log("Received transaction data:", JSON.stringify(reqBody, null, 2)); // Log input
    } catch (error) {
        return c.json({ error: 'Invalid JSON body' }, 400);
    }

    // Validate incoming data
    const validationResult = validateTransaction(reqBody); // Uses Zod schema from categories.db?
    if (!validationResult.success) {
        console.error("Zod validation failed:", JSON.stringify(validationResult.error.flatten(), null, 2)); // Log Zod error
        return c.json(
            { error: 'Invalid transaction data', details: validationResult.error.flatten() },
            400
        );
    }

    // Ensure correct user_id and potentially validate account ownership
    const dataToCreate = {
        ...validationResult.data,
        user_id: loggedInUser.id // IMPORTANT: Override user_id
    };

    // Optional: Verify the account_id belongs to the loggedInUser (unless admin)
    if (!loggedInUser.admin) {
        try {
            const account = await prisma.accounts.findUnique({
                where: { id: dataToCreate.account_id, user_id: loggedInUser.id }
            });
            if (!account) {
                console.warn(`User ${loggedInUser.username} tried to create transaction for account ${dataToCreate.account_id} they don't own.`);
                return c.json({ error: 'Invalid account specified' }, 403); // Or 400/404
            }
        } catch (accError) {
             console.error("Error verifying account ownership:", accError);
             return c.json({ error: "Server error verifying account"}, 500);
        }
    }

    // Create transaction in DB
    try {
         console.log(`User ${loggedInUser.username} creating transaction:`, dataToCreate);
        const createdTransaction = await createTransaction(dataToCreate); // Assumes this function works
        return c.json(createdTransaction, 201);
    } catch (error: any) {
        console.error("Error creating transaction in DB:", error);
        // Handle specific DB errors like foreign key violations if necessary
        return c.json({ error: 'Failed to create transaction' }, 500);
    }
});

// --- Categories Route (Public Example) ---
app.get('/categories', async (c) => {
    try {
        const categories = await getCategories();
        return c.json(categories ?? []);
    } catch (error) {
         console.error("Error fetching categories:", error);
         return c.json({ error: 'Failed to retrieve categories' }, 500);
    }
});

// --- Add other routes (Budgets, Payment Methods, etc.) ---


// --- Start Server ---
const port = parseInt(process.env.PORT || '8000');
console.log(`Server attempting to run on port ${port}`);

serve(
  { fetch: app.fetch, port: port },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
     if (!isCloudinaryConfigured) {
        console.warn("Warning: Cloudinary is not configured. Image uploads will fail.");
     }
  }
);