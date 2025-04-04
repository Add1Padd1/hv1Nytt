// categories.db.ts (Backend)

import { PrismaClient, Prisma } from '@prisma/client'; // Import Prisma for types if needed
import xss from 'xss'; // Note: xss might not be needed here if validation/sanitization happens elsewhere
// Remove unused imports if not needed:
// import { mock } from 'node:test';
// import { create } from 'domain';
// import { skip } from '@prisma/client/runtime/library';
import type {
  Account,
  Budget,
  Category,
  PaymentMethod,
  Transaction,
  TransactionToCreate, // Make sure this type definition matches Zod schema *without* user_id
  TransactionToDelete,
  TransactionToUpdate,
  User,
} from './types.js'; // Adjust path if needed
import { z } from 'zod';

// --- CORRECTED Zod Schema for Creating Transactions ---
// This schema validates data coming FROM the frontend request body
const TransactionToCreateSchema = z.object({
  // Validate account_id is a positive integer.
  // The min/max check (1-3) was removed as actual account IDs might differ.
  account_id: z.number().int().positive("Account ID must be a positive integer"),

  // user_id is REMOVED from this schema. It's added later from the token.

  // payment_method_id: Validate it's one of the allowed IDs (1, 2, or 3) based on your DB.
  payment_method_id: z.number().int().refine(id => [1, 2, 3].includes(id), {
      message: "Payment method ID must be 1, 2, or 3",
  }),

  // transaction_type: Use enum for fixed types.
  transaction_type: z.enum(['income', 'expense'], {
      required_error: "Transaction type is required",
      invalid_type_error: "Transaction type must be 'income' or 'expense'"
  }),

  // category: Use enum for fixed categories. Ensure names match DB exactly.
  category: z.enum(['matur', 'íbúð', 'samgöngur', 'afþreying', 'laun', 'annað'], {
      required_error: "Category is required",
      invalid_type_error: "Invalid category specified",
  }),

  // amount: Ensure positive number within a reasonable range.
  amount: z.number().positive("Amount must be greater than 0").max(1000000, "Amount cannot exceed 1,000,000"),

  // description: Basic string validation.
  description: z.string().min(1, "Description cannot be empty").max(1024, 'Description must be at most 1024 letters'),
});
// --- END CORRECTION ---

// Schema for Updating Transactions (Keep or adjust as needed)
// Note: You might also want to remove user_id here if it shouldn't be updatable.
// Also, the min/max(1, 3) checks on IDs might still be incorrect.
const TransactionToUpdateSchema = z.object({
  account_id: z.number().int().positive("Account ID must be a positive integer"),
  // user_id: z.number().int().positive("User ID must be a positive integer"), // Consider removing if not updatable
  payment_method_id: z.number().int().refine(id => [1, 2, 3].includes(id), {
      message: "Payment method ID must be 1, 2, or 3",
  }),
  transaction_type: z.enum(['income', 'expense']),
  category: z.enum(['matur', 'íbúð', 'samgöngur', 'afþreying', 'laun', 'annað']),
  amount: z.number().positive("Amount must be greater than 0").max(1000000),
  description: z.string().min(1).max(1024),
});

// Initialize Prisma Client
const prisma = new PrismaClient();

// --- Database Functions ---

// Function to validate incoming transaction data using the corrected schema
export function validateTransaction(transactionToValidate: unknown) {
  // Uses the corrected TransactionToCreateSchema defined above
  const result = TransactionToCreateSchema.safeParse(transactionToValidate);
  return result;
}

// Function to validate data for updating transactions
export function validateUpdatedTransaction(transactionToValidate: unknown) {
  const result = TransactionToUpdateSchema.safeParse(transactionToValidate);
  return result;
}


// --- Existing Database Functions (Keep as they are, unless changes are needed) ---

export async function getUsers(): Promise<Array<User>> {
  // Consider selecting only necessary fields and excluding password
  const users = await prisma.users.findMany({
    select: { id: true, username: true, email: true, admin: true, created: true, slug: true }
  });
  console.log('users fetched (count):', users.length);
  // Map admin null to false if needed, though schema default handles it
  return users.map(u => ({ ...u, admin: u.admin ?? false })) as User[];
}

export async function getUser(slug: string): Promise<User | null> {
  // Exclude password from selection
  const user = await prisma.users.findUnique({
    where: { slug: slug },
    select: { id: true, username: true, email: true, admin: true, created: true, slug: true }
  });
  if (user) {
     return { ...user, admin: user.admin ?? false } as User;
  }
  return null;
}

export async function getPaymentMethods(): Promise<Array<PaymentMethod>> {
  const paymentMethods = await prisma.payment_methods.findMany();
  console.log('paymentMethods fetched (count):', paymentMethods.length);
  return paymentMethods;
}

export async function getPaymentMethod(slug: string): Promise<PaymentMethod | null> {
  const pay = await prisma.payment_methods.findUnique({ where: { slug: slug } });
  return pay ?? null;
}

// Fetches ALL accounts - used by admin route in index.ts
export async function getAccounts(): Promise<Array<Account>> {
  const accounts = await prisma.accounts.findMany();
  console.log('All accounts fetched (count):', accounts.length);
  return accounts;
}

// Added function to get accounts by user ID (more efficient for non-admins)
export async function getAccountsByUserId(userId: number): Promise<Array<Account>> {
    const accounts = await prisma.accounts.findMany({
        where: { user_id: userId }
    });
    console.log(`Accounts fetched for user ${userId} (count):`, accounts.length);
    return accounts;
}


export async function getAccount(slug: string): Promise<Account | null> {
  const acc = await prisma.accounts.findUnique({ where: { slug: slug } });
  return acc ?? null;
}

export async function getBudgets(): Promise<Array<Budget>> {
  const budgets = await prisma.budgets.findMany();
  console.log('Budgets fetched (count):', budgets.length);
  return budgets;
}

export async function getBudget(slug: string): Promise<Budget | null> {
  const bud = await prisma.budgets.findUnique({ where: { slug: slug } });
  return bud ?? null;
}

export async function getCategories(): Promise<Array<Category>> {
  const categories = await prisma.categories.findMany();
  console.log('Categories fetched (count):', categories.length);
  return categories;
}

export async function getCategory(slug: string): Promise<Category | null> {
  const cat = await prisma.categories.findUnique({ where: { slug: slug } });
  return cat ?? null;
}

// Fetches ALL transactions with pagination (used by admin route)
export async function getTransactions(page: number): Promise<Array<Transaction>> {
  const transactions = await prisma.transactions.findMany({
    skip: page * 10, // Assuming page size is 10
    take: 10,
    orderBy: { id: 'desc' } // Example ordering
  });
  console.log(`All transactions fetched (page ${page}, count: ${transactions.length})`);
  return transactions;
}

// Get a single transaction by its slug
export async function getTransaction(slug: string): Promise<Transaction | null> {
  const tran = await prisma.transactions.findUnique({ where: { slug: slug } });
  return tran ?? null;
}

// Get transactions for a specific user by username
export async function getTransactionByUser(uname: string): Promise<Array<Transaction>> {
  // Find user first to get their ID
  const user = await prisma.users.findUnique({
    where: { username: uname },
    select: { id: true } // Only need the ID
  });
  console.log('User lookup for transactions:', user ? `Found ID ${user.id}` : `User ${uname} not found`);

  if (!user) {
    return []; // Return empty array if user doesn't exist
  }

  // Find transactions using the user's ID
  const transactions = await prisma.transactions.findMany({
    where: { user_id: user.id },
    orderBy: { id: 'desc' } // Example ordering
  });
  console.log(`Transactions fetched for user ${uname} (count: ${transactions.length})`);
  return transactions; // Returns empty array if user exists but has no transactions
}

// Creates a transaction - expects user_id to be provided in the input object now
// This input object type should match the expected data structure AFTER validation AND adding user_id
// Let's refine the input type definition slightly.
interface FullTransactionData extends Omit<Transaction, 'id' | 'slug' | 'created' | 'updated'> {
    user_id: number; // Ensure user_id is present
}
export async function createTransaction(
  transactionData: FullTransactionData // Use the refined type
): Promise<Transaction> {

   // Basic check if required fields are present (Zod should handle this, but belt-and-suspenders)
   if (!transactionData.user_id || !transactionData.account_id || !transactionData.payment_method_id) {
       throw new Error("Missing required IDs for transaction creation.");
   }

   // Generate a unique slug (simple example, consider a more robust library/method if needed)
   const slug = `tx-${transactionData.user_id}-${Date.now()}`;

   const createdTransaction = await prisma.transactions.create({
    data: {
      account_id: transactionData.account_id,
      user_id: transactionData.user_id, // Use the provided user_id
      payment_method_id: transactionData.payment_method_id,
      transaction_type: transactionData.transaction_type,
      category: transactionData.category,
      amount: transactionData.amount, // Prisma handles Decimal conversion
      description: transactionData.description,
      slug: slug, // Assign generated slug
    },
  });

  // No need to update slug separately if generated beforehand
  return createdTransaction;
}


// Delete a transaction by its slug
// The type TransactionToDelete was likely inferred from TransactionSchema, ensure it has 'slug'
export async function deleteTransaction(transactionToDelete: Pick<Transaction, 'slug'>): Promise<Transaction> {
  if (!transactionToDelete?.slug) {
    throw new Error('Transaction slug is required for deletion');
  }
  // Use delete operation
  const deletedTransaction = await prisma.transactions.delete({
    where: { slug: transactionToDelete.slug },
  });
  // Note: delete returns the deleted object
  return deletedTransaction;
}

// Update a transaction by its slug
// Input type TransactionToUpdate should match Zod schema
// The transactionToUpdate object should be the existing transaction record
export async function updateTransaction(
  newValidTransactionData: z.infer<typeof TransactionToUpdateSchema>, // Data from validated request
  existingTransaction: Transaction // The full existing transaction object (to get the slug)
): Promise<Transaction> { // Return the updated transaction

  if (!existingTransaction?.slug) {
    throw new Error('Existing transaction slug not found for update');
  }

  // Update using the slug from the existing record
  const updatedTransaction = await prisma.transactions.update({
    where: { slug: existingTransaction.slug },
    data: {
      // Only include fields allowed by TransactionToUpdateSchema
      account_id: newValidTransactionData.account_id,
      // user_id: newValidTransactionData.user_id, // Include only if updatable via schema
      payment_method_id: newValidTransactionData.payment_method_id,
      transaction_type: newValidTransactionData.transaction_type,
      category: newValidTransactionData.category,
      amount: newValidTransactionData.amount,
      description: newValidTransactionData.description,
      // Do not update slug here unless intended
    },
  });
  console.log('updatedTransaction :>> ', updatedTransaction);
  return updatedTransaction;
}