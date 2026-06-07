import { Command } from 'commander';
import { checkPlatform } from './platform';
import { addCommand } from './commands/add';
import { listCommand } from './commands/list';
import { removeCommand } from './commands/remove';
import { useCommand } from './commands/use';
import { checkCommand } from './commands/check';

checkPlatform();

const program = new Command();
program.name('gitiam').description('Atomic git identity switching');

program
  .command('add <name>')
  .description('Register a new identity interactively')
  .action(addCommand);

program
  .command('list')
  .description('List registered identities, marking the active one')
  .action(listCommand);

program
  .command('remove <name>')
  .description('Remove a registered identity')
  .option('-y, --yes', 'Skip the confirmation prompt')
  .action(removeCommand);

program
  .command('use <name>')
  .description('Atomically apply an identity: SSH key and global git config')
  .action(useCommand);

program
  .command('check')
  .description('Compare the active identity with the git identity resolved here')
  .option('--strict', 'Silent on match, exit 1 on divergence (for pre-commit hooks)')
  .action(checkCommand);

void program.parseAsync(process.argv);
