import chalk from "chalk";

export function printError(message: string, exitCode = 1): never {
  console.error(chalk.red("Error:"), message);
  process.exit(exitCode);
}

export function exitUserError(message: string): never {
  printError(message, 1);
}

export function exitRemoteError(message: string): never {
  printError(message, 2);
}
