/**
 * Back-compat aliases for the `accounts` command group (renamed from `user`).
 *
 * Shared between the real Commander command (`commands/user/index.ts`, via
 * `.aliases()`) and the lazy-loader/​completion dispatcher (`src/index.ts`),
 * which resolve different paths and would otherwise drift if the list were
 * duplicated. Kept in this dependency-free module so `src/index.ts` can import
 * it without eagerly pulling in the command implementation.
 */
export const ACCOUNT_COMMAND_ALIASES = ['user', 'users']
