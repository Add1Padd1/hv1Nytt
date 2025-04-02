import { z } from 'zod';
// User schema
const UserSchema = z.object({
  id: z.number(),
  username: z.string().nonempty(),
  password: z.string().nonempty(),
  admin: z.boolean(),
  created: z.date(),
  slug: z.string(),
});
export type User = z.infer<typeof UserSchema>;

// Payment Method schema
const PaymentMethodSchema = z.object({
  id: z.number(),
  name: z.string().nonempty(),
  slug: z.string(),
});
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
// Account schema
const AccountSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  account_name: z.string().nonempty(),
  balance: z.number(),
  created: z.date(),
  slug: z.string(),
});
export type Account = z.infer<typeof AccountSchema>;

// Category schema
const CategorySchema = z.object({
  id: z.number(),
  name: z.string().nonempty(),
  slug: z.string(),
});
export type Category = z.infer<typeof CategorySchema>;
// Budget schema
const BudgetSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  category: z.string(),
  monthly_limit: z.number(),
  created: z.date(),
  slug: z.string(),
});
export type Budget = z.infer<typeof BudgetSchema>;

// eslint-disable-next-line
const TransactionSchema = z.object({
  id: z.number(),
  account_id: z
    .number()
    .min(1, 'account_id must be from 1-3')
    .max(3, 'account_id must be from 1-3'),
  user_id: z
    .number()
    .min(1, 'user_id must be from 1-3')
    .max(3, 'user_id must be from 1-3'),
  payment_method_id: z
    .number()
    .min(1, 'payment_method_id must be from 1-3')
    .max(3, 'payment_method_id must be from 1-3'),
  transaction_type: z.string().nonempty(),
  category: z.string().nonempty('category must be filled out'),
  amount: z
    .number()
    .min(0, 'the amount has to be over 0 $')
    .max(1000000, 'the amount has to be under 1000000 $)'),
  description: z
    .string()
    .min(3, 'description must be at least 3 letters')
    .max(1024, 'description must be at most 1024 letters'),
  slug: z.string(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

const TransactionToCreateSchema = z.object({
  account_id: z
    .number()
    .min(1, 'account_id must be from 1-3')
    .max(3, 'account_id must be from 1-3'),
  user_id: z
    .number()
    .min(1, 'user_id must be from 1-3')
    .max(3, 'user_id must be from 1-3'),
  payment_method_id: z
    .number()
    .min(1, 'payment_method_id must be from 1-3')
    .max(3, 'payment_method_id must be from 1-3'),
  transaction_type: z.string().nonempty(),
  category: z.string().nonempty('category must be filled out'),
  amount: z
    .number()
    .min(0, 'the amount has to be over 0 $')
    .max(1000000, 'the amount has to be under 1000000 $)'),
  description: z
    .string()
    .min(3, 'description must be at least 3 letters')
    .max(1024, 'description must be at most 1024 letters'),
});

export type TransactionToCreate = z.infer<typeof TransactionToCreateSchema>;

const TransactionToUpdateSchema = z.object({
  account_id: z
    .number()
    .min(1, 'account_id must be from 1-3')
    .max(3, 'account_id must be from 1-3'),
  user_id: z
    .number()
    .min(1, 'user_id must be from 1-3')
    .max(3, 'user_id must be from 1-3'),
  payment_method_id: z
    .number()
    .min(1, 'payment_method_id must be from 1-3')
    .max(3, 'payment_method_id must be from 1-3'),
  transaction_type: z.string().nonempty(),
  category: z.string().nonempty('category must be filled out'),
  amount: z
    .number()
    .min(0, 'the amount has to be over 0 $')
    .max(1000000, 'the amount has to be under 1000000 $)'),
  description: z
    .string()
    .min(3, 'description must be at least 3 letters')
    .max(1024, 'description must be at most 1024 letters'),
});

export type TransactionToUpdate = z.infer<typeof TransactionToUpdateSchema>;
export type TransactionToDelete = z.infer<typeof TransactionSchema>;
