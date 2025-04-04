// categories.db.ts (Backend - LEIÐRÉTT)

import { PrismaClient, Prisma } from '@prisma/client';
import type {
  Account, Budget, Category, PaymentMethod, Transaction,
  TransactionToCreate, // Make sure types.ts reflects this schema (no user_id initially)
  TransactionToDelete, TransactionToUpdate, User,
} from './types.js'; // Adjust path if needed
import { z } from 'zod';

// --- Zod Schemas ---
const TransactionToCreateSchema = z.object({
  account_id: z.number().int().positive("Account ID must be a positive integer"),
  payment_method_id: z.number().int().refine(id => [1, 2, 3].includes(id), { message: "Payment method ID must be 1, 2, or 3" }),
  transaction_type: z.enum(['income', 'expense'], { required_error: "Type is required" }),
  category: z.enum(['matur', 'íbúð', 'samgöngur', 'afþreying', 'laun', 'annað'], { required_error: "Category is required" }),
  amount: z.number().positive("Amount must be > 0").max(1000000),
  description: z.string().min(1, "Description required").max(1024),
  // Optional field from frontend for admin use
  target_user_id: z.number().int().positive().optional(),
});

const TransactionToUpdateSchema = z.object({
  // Define schema for updating, likely similar but may have optional fields
  account_id: z.number().int().positive().optional(),
  payment_method_id: z.number().int().refine(id => [1, 2, 3].includes(id)).optional(),
  transaction_type: z.enum(['income', 'expense']).optional(),
  category: z.enum(['matur', 'íbúð', 'samgöngur', 'afþreying', 'laun', 'annað']).optional(),
  amount: z.number().positive("Amount must be > 0").max(1000000).optional(),
  description: z.string().min(1).max(1024).optional(),
});
// --- End Zod Schemas ---

const prisma = new PrismaClient();

// --- Validation Functions ---
export function validateTransaction(data: unknown) { return TransactionToCreateSchema.safeParse(data); }
export function validateUpdatedTransaction(data: unknown) { return TransactionToUpdateSchema.safeParse(data); }
// --- End Validation Functions ---


// --- Database Functions ---

// Get users for admin dropdown
export async function getUsersForAdminDropdown(): Promise<Array<{ id: number; username: string }>> {
    try {
        const users = await prisma.users.findMany({
            select: { id: true, username: true },
            orderBy: { username: 'asc' }
        });
        console.log(`Fetched ${users.length} users for admin dropdown.`);
        return users;
    } catch (error) {
        console.error("Error fetching users for admin:", error);
        throw error; // Re-throw for route handler to catch
    }
}

// Get all users (consider limiting fields)
export async function getUsers(): Promise<Array<Partial<User>>> { // Return Partial<User> to exclude password
  const users = await prisma.users.findMany({
    select: { id: true, username: true, email: true, admin: true, created: true, slug: true }
  });
  return users.map(u => ({ ...u, admin: u.admin ?? false }));
}

// Get single user (exclude password)
export async function getUser(slug: string): Promise<Partial<User> | null> {
  const user = await prisma.users.findUnique({
    where: { slug: slug },
    select: { id: true, username: true, email: true, admin: true, created: true, slug: true }
  });
  return user ? { ...user, admin: user.admin ?? false } : null;
}

// --- LEIÐRÉTT getAccounts ---
// Fetches ALL accounts for admin, including related user's username
export async function getAccounts(): Promise<Array<Account & { users?: { username?: string } | null }>> {
    try {
        const accounts = await prisma.accounts.findMany({
            include: {
                // Use correct relation name 'users' from schema.prisma
                users: {
                    select: { username: true }
                }
            },
            orderBy: {
                // Simpler ordering by account name first
                account_name: 'asc'
            }
        });
        console.log('All accounts with owners fetched (count):', accounts.length);
        // The result includes 'users' which might be null if account.user_id is null
        return accounts;
    } catch (error) {
        console.error("Error in getAccounts:", error);
        throw error; // Re-throw
    }
}
// --- LOK Á LEIÐRÉTTINGU ---

// Get accounts by specific user ID
export async function getAccountsByUserId(userId: number): Promise<Array<Account>> {
    try {
        return await prisma.accounts.findMany({ where: { user_id: userId }, orderBy: { account_name: 'asc' } });
    } catch (error) {
        console.error(`Error fetching accounts for user ${userId}:`, error);
        throw error;
    }
}

// Get single account by slug
export async function getAccount(slug: string): Promise<Account | null> {
    try { return await prisma.accounts.findUnique({ where: { slug: slug } }); }
    catch (error) { console.error(`Error fetching account ${slug}:`, error); throw error; }
}


export async function getPaymentMethods(): Promise<Array<PaymentMethod>> {
    try { return await prisma.payment_methods.findMany(); }
    catch (error) { console.error("Error fetching payment methods:", error); throw error; }
}
export async function getPaymentMethod(slug: string): Promise<PaymentMethod | null> {
    try { return await prisma.payment_methods.findUnique({ where: { slug: slug } }); }
    catch (error) { console.error(`Error fetching payment method ${slug}:`, error); throw error; }
}
export async function getBudgets(): Promise<Array<Budget>> {
    try { return await prisma.budgets.findMany(); }
    catch (error) { console.error("Error fetching budgets:", error); throw error; }
}
export async function getBudget(slug: string): Promise<Budget | null> {
    try { return await prisma.budgets.findUnique({ where: { slug: slug } }); }
    catch (error) { console.error(`Error fetching budget ${slug}:`, error); throw error; }
}
export async function getCategories(): Promise<Array<Category>> {
    try { return await prisma.categories.findMany(); }
    catch (error) { console.error("Error fetching categories:", error); throw error; }
}
export async function getCategory(slug: string): Promise<Category | null> {
    try { return await prisma.categories.findUnique({ where: { slug: slug } }); }
    catch (error) { console.error(`Error fetching category ${slug}:`, error); throw error; }
}

// Get all transactions (paginated) for admin
export async function getTransactions(page: number): Promise<Array<Transaction>> {
    const skip = Math.max(0, page) * 10; // Ensure skip isn't negative
    try {
        return await prisma.transactions.findMany({ skip: skip, take: 10, orderBy: { id: 'desc' } });
    } catch (error) {
        console.error(`Error fetching transactions page ${page}:`, error);
        throw error;
    }
}

// Get single transaction by slug
export async function getTransaction(slug: string): Promise<Transaction | null> {
    try { return await prisma.transactions.findUnique({ where: { slug: slug } }); }
    catch (error) { console.error(`Error fetching transaction ${slug}:`, error); throw error; }
}

// Get transactions by username
export async function getTransactionByUser(uname: string): Promise<Array<Transaction>> {
    try {
        const user = await prisma.users.findUnique({ where: { username: uname }, select: { id: true } });
        if (!user) return [];
        return await prisma.transactions.findMany({ where: { user_id: user.id }, orderBy: { id: 'desc' } });
    } catch (error) {
        console.error(`Error fetching transactions for user ${uname}:`, error);
        throw error;
    }
}

// Type for validated data + user_id needed by createTransaction
interface FullTransactionData extends z.infer<typeof TransactionToCreateSchema> {
    user_id: number;
}
// Creates a transaction
export async function createTransaction(transactionData: FullTransactionData): Promise<Transaction> {
   // Basic check for required IDs
   if (transactionData.user_id == null || transactionData.account_id == null || transactionData.payment_method_id == null) {
       throw new Error("Missing required IDs (user, account, payment method) for transaction creation.");
   }

   const slug = `tx-${transactionData.user_id}-${Date.now()}`;
   // Exclude potential target_user_id from data sent to DB
   const { target_user_id, ...dbData } = transactionData;

   try {
       const createdTransaction = await prisma.transactions.create({
           data: { ...dbData, slug: slug }, // Use validated data + user_id + slug
       });
       return createdTransaction;
   } catch (error) {
        console.error("Error in createTransaction DB call:", error);
        // Could check for specific Prisma errors (like P2003 foreign key)
        throw error; // Re-throw for route handler
   }
}

// Delete transaction
export async function deleteTransaction(transactionToDelete: Pick<Transaction, 'slug'>): Promise<Transaction> {
  if (!transactionToDelete?.slug) throw new Error('Slug required for deletion');
  try { return await prisma.transactions.delete({ where: { slug: transactionToDelete.slug } }); }
  catch (error) { console.error(`Error deleting transaction ${transactionToDelete.slug}:`, error); throw error; }
}

// Update transaction
export async function updateTransaction(
  newValidData: z.infer<typeof TransactionToUpdateSchema>,
  existing: Pick<Transaction, 'slug'>
): Promise<Transaction> {
  if (!existing?.slug) throw new Error('Existing slug required for update');
  try {
      return await prisma.transactions.update({
          where: { slug: existing.slug },
          data: { ...newValidData }, // Spread validated update data
      });
  } catch (error) {
      console.error(`Error updating transaction ${existing.slug}:`, error);
      throw error;
  }
}

// --- End Database Functions ---