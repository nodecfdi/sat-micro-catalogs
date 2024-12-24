import { HelpCommand, Kernel, ListLoader } from '@adonisjs/ace';
import SatCatalogsPopulateCommand from './commands/sat_catalogs_populate_command.js';

const kernel = Kernel.create();
kernel.addLoader(new ListLoader([HelpCommand, SatCatalogsPopulateCommand]));

kernel.defineFlag('help', {
  type: 'boolean',
  alias: 'h',
  description: 'Display help for the given command. When no command is given display help for the list command',
});

kernel.on('help', async (command, $kernel, options: { args: string[] }) => {
  options.args.unshift(command.commandName);
  await new HelpCommand($kernel, options, kernel.ui, kernel.prompt).exec();

  return true;
});

kernel.info.set('binary', 'node ace');

await kernel.handle(process.argv.slice(2));
