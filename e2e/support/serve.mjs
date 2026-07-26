import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npm, ['run', 'e2e:fixture'], { stdio: 'inherit' }),
  spawn(npm, ['run', 'start:e2e', '--', '--host', '::', '--port', '18080'], {
    stdio: 'inherit',
  }),
];

let stopping = false;
const stop = (signal = 'SIGTERM') => {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
};

for (const child of children) {
  child.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(
        `standalone e2e service exited (${signal ?? `code ${code ?? 1}`})`
      );
      stop();
      process.exitCode = code ?? 1;
    }
  });
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

await Promise.all(
  children.map(
    (child) =>
      new Promise((resolve) => {
        child.once('exit', resolve);
      })
  )
);
