import { Command } from 'commander';
import { checkPlatform } from './platform';
import { addCommand } from './commands/add';
import { listCommand } from './commands/list';
import { removeCommand } from './commands/remove';

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

void program.parseAsync(process.argv);
