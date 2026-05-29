import * as os from 'node:os';
import * as path from 'node:path';

export const CONFIG_DIR = path.join(os.homedir(), '.config', 'gitiam');
export const IDENTITIES_FILE = path.join(CONFIG_DIR, 'identities.json');
export const ACTIVE_FILE = path.join(CONFIG_DIR, 'active');

export function checkPlatform(): void {
  if (process.platform === 'win32') {
    process.stderr.write("gitiam doesn't support Windows natively. Use WSL.\n");
    process.exit(1);
  }
}
