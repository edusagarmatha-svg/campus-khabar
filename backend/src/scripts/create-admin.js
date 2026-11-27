#!/usr/bin/env node

/**
 * Creates the first Admin account. Deliberately interactive: passwords are
 * typed with echo disabled and never accepted from flags, files, or logs.
 *
 * Refuses to run when any admin already exists, so it cannot quietly overwrite
 * or duplicate the initial account. Run it with the same environment as the
 * app so it targets the intended database:
 *
 *   npm run create-admin
 */

const bcrypt = require('bcrypt');
const { z } = require('zod');
const readline = require('node:readline/promises');

const db = require('../db/knex');

const BCRYPT_COST = 12;
const BOOTSTRAP_LOCK_NAME = 'admin_bootstrap';
const MIN_PASSWORD_LENGTH = 12;
// bcrypt only uses the first 72 bytes of a password; reject longer input rather
// than silently accepting a password whose tail is ignored.
const MAX_PASSWORD_BYTES = 72;

const emailSchema = z.email().max(255);
const nameSchema = z.string().min(1).max(120);

/**
 * Reads one line from the terminal without echoing what is typed.
 */
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

        // Ignore other control characters (arrows, escape sequences).
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
      'A terminal is required: run this script interactively (npm run create-admin).',
    );
    return 1;
  }

  console.log('Campus Kabar - create the initial Admin account');
  console.log('Passwords are entered with echo disabled.\n');

  const existingAdmin = await db('users').where({ role: 'admin' }).first('id');

  if (existingAdmin) {
    console.error(
      'Refusing to run: an admin account already exists. This script only creates the first one.',
    );
    return 1;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const name = (await rl.question('Name: ')).trim();
  const emailInput = (await rl.question('Email: ')).trim();
  rl.close();

  const nameResult = nameSchema.safeParse(name);

  if (!nameResult.success) {
    console.error('Name is required and must be at most 120 characters.');
    return 1;
  }

  const email = emailInput.toLowerCase();
  const emailResult = emailSchema.safeParse(email);

  if (!emailResult.success) {
    console.error('Enter a valid email address (at most 255 characters).');
    return 1;
  }

  const password = await promptHidden(
    `Password (minimum ${MIN_PASSWORD_LENGTH} characters): `,
  );
  const confirmation = await promptHidden('Confirm password: ');

  if (password !== confirmation) {
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

  try {
    await db.transaction(async (trx) => {
      // A named row is locked FOR UPDATE. Unlike locking the users table, this
      // works when there is no Admin row yet, so concurrent bootstraps cannot
      // both pass the existence check.
      const bootstrapLock = await trx('system_locks')
        .where({ name: BOOTSTRAP_LOCK_NAME })
        .forUpdate()
        .first();

      if (!bootstrapLock) {
        const error = new Error('Bootstrap lock row is missing. Run migrations first.');
        error.code = 'BOOTSTRAP_LOCK_MISSING';
        throw error;
      }

      const admin = await trx('users').where({ role: 'admin' }).forUpdate().first('id');

      if (admin) {
        const error = new Error('An admin account already exists.');
        error.code = 'ADMIN_EXISTS';
        throw error;
      }

      await trx('users').insert({
        name: nameResult.data,
        email: emailResult.data,
        password_hash: passwordHash,
        role: 'admin',
        is_active: true,
      });
    });
  } catch (error) {
    if (error.code === 'ADMIN_EXISTS') {
      console.error('Refusing to run: an admin account already exists.');
      return 1;
    }

    if (error.code === 'BOOTSTRAP_LOCK_MISSING') {
      console.error('The bootstrap lock is missing. Run `npm run migrate` first.');
      return 1;
    }

    if (error.code === 'ER_DUP_ENTRY') {
      console.error('An account with that email already exists.');
      return 1;
    }

    console.error(`Could not create the admin account: ${error.message}`);
    return 1;
  }

  console.log(
    `\nAdmin account created for ${emailResult.data}. The password was not stored or logged in plain text.`,
  );
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    // Never print a stack trace or any input value here.
    console.error(error.message === 'Cancelled.' ? 'Cancelled.' : `Failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
