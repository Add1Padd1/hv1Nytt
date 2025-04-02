import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import xss from 'xss';
import { mock } from 'node:test';
import { create } from 'domain';
import { skip } from '@prisma/client/runtime/library';
import type { Account, Transaction, User } from './types.js';

const prisma = new PrismaClient();

export async function getUser(slug: string): Promise<User | null> {
  const user = await prisma.users.findUnique({
    where: {
      slug: slug,
    },
  });
  return user ?? null;
}
export async function getUserByLogin(
  username: string,
  password: string
): Promise<User | null> {
  const user = await prisma.users.findUnique({
    where: {
      username: username,
      password: password,
    },
  });
  return user ?? null;
}

export async function getAccount(slug: string): Promise<Account | null> {
  const acc = await prisma.accounts.findUnique({
    where: {
      slug: slug,
    },
  });
  return acc ?? null;
}

export async function getTransactionByUser(
  user: User
): Promise<Array<Transaction> | null> {
  const tran = await prisma.transactions.findMany({
    where: {
      user_id: user['id'],
    },
  });
  return tran ?? null;
}
