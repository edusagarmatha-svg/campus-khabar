#!/usr/bin/env node

/**
 * Emergency recovery for an existing active Admin account.
 *
 * This script never creates an account and never prints a password. It updates
 * the password hash and revokes every refresh token for that account, forcing
 * existing sessions to authenticate again.
 *
 * Run it interactively with the same environment as the API:
 *
 *   npm run reset-admin-password
 */

const bcrypt = require('bcrypt');
const { z } = require('zod');
const readline = require('node:readline/promises');

const db = require('../db/knex');

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72;

const emailSchema = z.email().max(255);

function promptHidden(label) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;

    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      reject(new Error('A terminal is required for hidden password input.'));
      return;
    }

    stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';

    function cleanup() {
      stdin.removeListener('data', onData);
      stdin.removeListener('end', onEnd);
      stdin.setRawMode(false);
      stdin.pause();
    }

    function onData(chunk) {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }

        if (char === '\u0003' || char === '\u0004') {
          cleanup();
          stdout.write('\n');
          reject(new Error('Cancelled.'));
          return;
        }

        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }

        if (char >= ' ') {
          value += char;
        }
      }
    }

    function onEnd() {
      cleanup();
      stdout.write('\n');
      reject(new Error('Input closed.'));
    }

    stdin.on('data', onData);
    stdin.on('end', onEnd);
  });
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(
      'A terminal is required: run this script interactively (npm run reset-admin-password).',
    );
    return 1;
  }

  console.log('Campus Kabar - reset an existing Admin password');
  console.log('This revokes every active session for the account.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const email = (await rl.question('Admin email: ')).trim().toLowerCase();
  const confirmation = (await rl.question('Type RESET to continue: ')).trim();
  rl.close();

  if (confirmation !== 'RESET') {
    console.error('Cancelled: confirmation did not match.');
    return 1;
  }

  const emailResult = emailSchema.safeParse(email);

  if (!emailResult.success) {
    console.error('Enter a valid email address.');
    return 1;
  }

  const password = await promptHidden(
    `New password (minimum ${MIN_PASSWORD_LENGTH} characters): `,
  );
  const passwordConfirmation = await promptHidden('Confirm new password: ');

  if (password !== passwordConfirmation) {
    console.error('Passwords do not match.');
    return 1;
  }

  if (password.trim().length < MIN_PASSWORD_LENGTH) {
    console.error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
    return 1;
  }

  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    console.error(
      `Password must be at most ${MAX_PASSWORD_BYTES} bytes (UTF-8).`,
    );
    return 1;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  let revokedSessions = 0;

  try {
    await db.transaction(async (trx) => {
      const admin = await trx('users')
        .where({
          email: emailResult.data,
          role: 'admin',
          is_active: true,
        })
        .forUpdate()
        .first('id');

      if (!admin) {
        const error = new Error('No active Admin account matches that email.');
        error.code = 'ADMIN_NOT_FOUND';
        throw error;
      }

      const now = new Date();

      await trx('users').where({ id: admin.id }).update({
        password_hash: passwordHash,
        updated_at: now,
      });

      revokedSessions = await trx('refresh_tokens')
        .where({ user_id: admin.id })
        .whereNull('revoked_at')
        .update({ revoked_at: now });
    });
  } catch (error) {
    if (error.code === 'ADMIN_NOT_FOUND') {
      console.error('No active Admin account matches that email.');
      return 1;
    }

    console.error(`Could not reset the password: ${error.message}`);
    return 1;
  }

  console.log(
    `Password reset for ${emailResult.data}. Revoked ${revokedSessions} active session(s).`,
  );
  console.log('Review account activity and rotate any other exposed credentials.');
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(
      error.message === 'Cancelled.' ? 'Cancelled.' : `Failed: ${error.message}`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
