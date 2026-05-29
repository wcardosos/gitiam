import { Command } from 'commander';
import { checkPlatform } from './platform';
import { addCommand } from './commands/add';

checkPlatform();

const program = new Command();
program.name('gitiam').description('Atomic git identity switching');

program
  .command('add <name>')
  .description('Register a new identity interactively')
  .action(addCommand);

void program.parseAsync(process.argv);
