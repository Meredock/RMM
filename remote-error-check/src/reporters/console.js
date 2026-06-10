const chalk = require('chalk');

function reportResults(results) {
  console.log('\n' + chalk.bold('─── Remote Error Check Results ───'));
  for (const result of results) {
    const icon = result.ok ? chalk.green('✔') : chalk.red('✘');
    const status = result.status ? `HTTP ${result.status}` : 'NO RESPONSE';
    const duration = `${result.duration}ms`;

    if (result.ok) {
      console.log(`${icon} ${chalk.cyan(result.url)} — ${chalk.green(status)} (${duration})`);
    } else {
      const reason = result.error || status;
      console.log(`${icon} ${chalk.cyan(result.url)} — ${chalk.red(reason)} (${duration})`);
    }
  }
  console.log(chalk.bold('──────────────────────────────────\n'));
}

module.exports = { reportResults };
