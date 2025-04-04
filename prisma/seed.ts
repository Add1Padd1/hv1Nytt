// prisma/seed.ts

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Helper function for delay (keep it just in case, though less likely needed now)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- DEFINE CATEGORY NAMES ---
const CATEGORY_MATUR = 'matur';
const CATEGORY_IBUD = 'íbúð';
const CATEGORY_SAMGONGUR = 'samgöngur';
const CATEGORY_AFTHREYING = 'afþreying';
const CATEGORY_LAUN = 'laun';
const CATEGORY_ANNAD = 'annað';
// --- END DEFINITIONS ---

async function main() {
  console.log(`Start seeding ...`);
  // Optional: Add delay back if needed, but try without first
  // const delaySeconds = 2;
  // console.log(`Waiting ${delaySeconds} seconds...`);
  // await sleep(delaySeconds * 1000);
  // console.log(`Wait finished.`);

  // --- Create Users ---
  console.log(`Creating users ...`);
  const adminUser = await prisma.users.create({ data: { username: 'admin', email: 'admin@example.com', password: await bcrypt.hash('password123', 10), admin: true, slug: 'admin' } });
  const jonasUser = await prisma.users.create({ data: { username: 'jonas', email: 'jonas@example.com', password: await bcrypt.hash('laungis123', 10), admin: false, slug: 'jonas' } });
  const katrinUser = await prisma.users.create({ data: { username: 'katrin', email: 'katrin@example.com', password: await bcrypt.hash('draumur456', 10), admin: false, slug: 'katrin' } });
  console.log(`Created users: ${adminUser.username}, ${jonasUser.username}, ${katrinUser.username}`);

  // --- Create Accounts ---
   console.log(`Creating accounts ...`);
  const adminAccount = await prisma.accounts.create({ data: { user_id: adminUser.id, account_name: 'Aðalreikningur', balance: 5000.00, slug: 'admin-adalreikningur' } });
  const jonasAccount = await prisma.accounts.create({ data: { user_id: jonasUser.id, account_name: 'Jónas reikningur', balance: 2500.00, slug: 'jonas-reikningur' } });
  const katrinAccount = await prisma.accounts.create({ data: { user_id: katrinUser.id, account_name: 'Katríns reikningur', balance: 3000.00, slug: 'katrins-reikningur' } });
  console.log(`Created accounts.`);

  // --- Create Categories ---
  console.log(`Creating categories ...`);
  await prisma.categories.createMany({
    data: [
      // Use constants and ensure slugs match
      { name: CATEGORY_MATUR, slug: 'matur' },
      { name: CATEGORY_IBUD, slug: 'ibud' },
      { name: CATEGORY_SAMGONGUR, slug: 'samgongur' },
      { name: CATEGORY_AFTHREYING, slug: 'afthreying' },
      { name: CATEGORY_LAUN, slug: 'laun' },
      { name: CATEGORY_ANNAD, slug: 'annad' },
    ],
  });
  console.log(`Created categories.`);

  // --- Create Payment Methods ---
  console.log(`Creating payment methods ...`);
  const paymentMethod1 = await prisma.payment_methods.create({ data: { name: 'reiðufé', slug: 'reidufe' } });
  const paymentMethod2 = await prisma.payment_methods.create({ data: { name: 'kreditkort', slug: 'kreditkort' } });
  const paymentMethod3 = await prisma.payment_methods.create({ data: { name: 'bankamillifærsla', slug: 'bankamillifaersla' } });
  console.log(`Created payment methods.`);

  // Generate slugs for transactions (example)
  const generateTxSlug = (prefix: string, index: number) => `${prefix}-tx-${Date.now()}-${index}`;

  // --- Create Transactions for Admin ---
  console.log(`Creating transactions for admin ...`);
  await prisma.transactions.createMany({
    data: [
      // Use constants for category names
      { account_id: adminAccount.id, user_id: adminUser.id, payment_method_id: paymentMethod1.id, transaction_type: 'income', category: CATEGORY_LAUN, amount: 6000.00, description: 'Laun fyrir mánuðinn', slug: generateTxSlug('admin', 1) },
      { account_id: adminAccount.id, user_id: adminUser.id, payment_method_id: paymentMethod2.id, transaction_type: 'expense', category: CATEGORY_MATUR, amount: 150.00, description: 'Morgunmatur', slug: generateTxSlug('admin', 2) },
      { account_id: adminAccount.id, user_id: adminUser.id, payment_method_id: paymentMethod3.id, transaction_type: 'expense', category: CATEGORY_SAMGONGUR, amount: 50.00, description: 'Strætó miða', slug: generateTxSlug('admin', 3) },
      { account_id: adminAccount.id, user_id: adminUser.id, payment_method_id: paymentMethod1.id, transaction_type: 'expense', category: CATEGORY_IBUD, amount: 1200.00, description: 'Leiga', slug: generateTxSlug('admin', 4) },
      { account_id: adminAccount.id, user_id: adminUser.id, payment_method_id: paymentMethod2.id, transaction_type: 'expense', category: CATEGORY_AFTHREYING, amount: 200.00, description: 'Kvöldbíó', slug: generateTxSlug('admin', 5) },
      { account_id: adminAccount.id, user_id: adminUser.id, payment_method_id: paymentMethod3.id, transaction_type: 'expense', category: CATEGORY_ANNAD, amount: 100.00, description: 'Óvænt útgjöld', slug: generateTxSlug('admin', 6) },
      { account_id: adminAccount.id, user_id: adminUser.id, payment_method_id: paymentMethod1.id, transaction_type: 'income', category: CATEGORY_LAUN, amount: 300.00, description: 'Bonus', slug: generateTxSlug('admin', 7) },
      { account_id: adminAccount.id, user_id: adminUser.id, payment_method_id: paymentMethod2.id, transaction_type: 'expense', category: CATEGORY_MATUR, amount: 100.00, description: 'Næturmatur', slug: generateTxSlug('admin', 8) },
      { account_id: adminAccount.id, user_id: adminUser.id, payment_method_id: paymentMethod3.id, transaction_type: 'expense', category: CATEGORY_SAMGONGUR, amount: 75.00, description: 'Taksi', slug: generateTxSlug('admin', 9) },
      { account_id: adminAccount.id, user_id: adminUser.id, payment_method_id: paymentMethod1.id, transaction_type: 'expense', category: CATEGORY_IBUD, amount: 1150.00, description: 'Heildar leiga', slug: generateTxSlug('admin', 10) },
    ],
  });

  // --- Create Transactions for Jonas ---
  console.log(`Creating transactions for jonas ...`);
  await prisma.transactions.createMany({
    data: [
      // Use constants
      { account_id: jonasAccount.id, user_id: jonasUser.id, payment_method_id: paymentMethod1.id, transaction_type: 'income', category: CATEGORY_LAUN, amount: 4000.00, description: 'Laun', slug: generateTxSlug('jonas', 1) },
      { account_id: jonasAccount.id, user_id: jonasUser.id, payment_method_id: paymentMethod2.id, transaction_type: 'expense', category: CATEGORY_MATUR, amount: 120.00, description: 'Frokostur', slug: generateTxSlug('jonas', 2) },
      { account_id: jonasAccount.id, user_id: jonasUser.id, payment_method_id: paymentMethod3.id, transaction_type: 'expense', category: CATEGORY_SAMGONGUR, amount: 40.00, description: 'Taksi', slug: generateTxSlug('jonas', 3) },
      { account_id: jonasAccount.id, user_id: jonasUser.id, payment_method_id: paymentMethod1.id, transaction_type: 'expense', category: CATEGORY_IBUD, amount: 900.00, description: 'Leiga', slug: generateTxSlug('jonas', 4) },
      { account_id: jonasAccount.id, user_id: jonasUser.id, payment_method_id: paymentMethod2.id, transaction_type: 'expense', category: CATEGORY_AFTHREYING, amount: 180.00, description: 'Veisla', slug: generateTxSlug('jonas', 5) },
      { account_id: jonasAccount.id, user_id: jonasUser.id, payment_method_id: paymentMethod3.id, transaction_type: 'expense', category: CATEGORY_ANNAD, amount: 80.00, description: 'Annað', slug: generateTxSlug('jonas', 6) },
      { account_id: jonasAccount.id, user_id: jonasUser.id, payment_method_id: paymentMethod1.id, transaction_type: 'income', category: CATEGORY_LAUN, amount: 200.00, description: 'Viðbót', slug: generateTxSlug('jonas', 7) },
      { account_id: jonasAccount.id, user_id: jonasUser.id, payment_method_id: paymentMethod2.id, transaction_type: 'expense', category: CATEGORY_MATUR, amount: 90.00, description: 'Kvöldmatur', slug: generateTxSlug('jonas', 8) },
      { account_id: jonasAccount.id, user_id: jonasUser.id, payment_method_id: paymentMethod3.id, transaction_type: 'expense', category: CATEGORY_SAMGONGUR, amount: 55.00, description: 'Strætó', slug: generateTxSlug('jonas', 9) },
      { account_id: jonasAccount.id, user_id: jonasUser.id, payment_method_id: paymentMethod1.id, transaction_type: 'expense', category: CATEGORY_IBUD, amount: 950.00, description: 'Leiga', slug: generateTxSlug('jonas', 10) },
    ],
  });

  // --- Create Transactions for Katrin ---
   console.log(`Creating transactions for katrin ...`);
  await prisma.transactions.createMany({
    data: [
      // Use constants
      { account_id: katrinAccount.id, user_id: katrinUser.id, payment_method_id: paymentMethod1.id, transaction_type: 'income', category: CATEGORY_LAUN, amount: 5000.00, description: 'Laun', slug: generateTxSlug('katrin', 1) },
      { account_id: katrinAccount.id, user_id: katrinUser.id, payment_method_id: paymentMethod2.id, transaction_type: 'expense', category: CATEGORY_MATUR, amount: 130.00, description: 'Morgunmatur', slug: generateTxSlug('katrin', 2) },
      { account_id: katrinAccount.id, user_id: katrinUser.id, payment_method_id: paymentMethod3.id, transaction_type: 'expense', category: CATEGORY_SAMGONGUR, amount: 60.00, description: 'Strætó', slug: generateTxSlug('katrin', 3) },
      { account_id: katrinAccount.id, user_id: katrinUser.id, payment_method_id: paymentMethod1.id, transaction_type: 'expense', category: CATEGORY_IBUD, amount: 1100.00, description: 'Leiga', slug: generateTxSlug('katrin', 4) },
      { account_id: katrinAccount.id, user_id: katrinUser.id, payment_method_id: paymentMethod2.id, transaction_type: 'expense', category: CATEGORY_AFTHREYING, amount: 150.00, description: 'Kvöldforrit', slug: generateTxSlug('katrin', 5) },
      { account_id: katrinAccount.id, user_id: katrinUser.id, payment_method_id: paymentMethod3.id, transaction_type: 'expense', category: CATEGORY_ANNAD, amount: 70.00, description: 'Annað', slug: generateTxSlug('katrin', 6) },
      { account_id: katrinAccount.id, user_id: katrinUser.id, payment_method_id: paymentMethod1.id, transaction_type: 'income', category: CATEGORY_LAUN, amount: 250.00, description: 'Viðbót', slug: generateTxSlug('katrin', 7) },
      { account_id: katrinAccount.id, user_id: katrinUser.id, payment_method_id: paymentMethod2.id, transaction_type: 'expense', category: CATEGORY_MATUR, amount: 95.00, description: 'Hádegismatur', slug: generateTxSlug('katrin', 8) },
      { account_id: katrinAccount.id, user_id: katrinUser.id, payment_method_id: paymentMethod3.id, transaction_type: 'expense', category: CATEGORY_SAMGONGUR, amount: 45.00, description: 'Taksi', slug: generateTxSlug('katrin', 9) },
      { account_id: katrinAccount.id, user_id: katrinUser.id, payment_method_id: paymentMethod1.id, transaction_type: 'expense', category: CATEGORY_IBUD, amount: 1050.00, description: 'Leiga', slug: generateTxSlug('katrin', 10) },
    ],
  });

  // --- Create Budgets ---
   console.log(`Creating budgets ...`);
  await prisma.budgets.createMany({
    data: [
      // Use constants
      { user_id: adminUser.id, category: CATEGORY_MATUR, monthly_limit: 400.00, slug: 'admin-budget-matur' },
      { user_id: adminUser.id, category: CATEGORY_IBUD, monthly_limit: 1300.00, slug: 'admin-budget-ibud' },
      { user_id: jonasUser.id, category: CATEGORY_MATUR, monthly_limit: 350.00, slug: 'jonas-budget-matur' },
      { user_id: jonasUser.id, category: CATEGORY_SAMGONGUR, monthly_limit: 150.00, slug: 'jonas-budget-samgongur' },
      { user_id: katrinUser.id, category: CATEGORY_MATUR, monthly_limit: 450.00, slug: 'katrin-budget-matur' },
      { user_id: katrinUser.id, category: CATEGORY_IBUD, monthly_limit: 1200.00, slug: 'katrin-budget-ibud' },
    ],
  });
   console.log(`Created budgets.`);

  console.log(`Seeding finished.`);
}

main()
  .catch(async (e) => { // Make catch async
    console.error('Error during seeding:', e);
    await prisma.$disconnect(); // Ensure disconnect even on error
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });