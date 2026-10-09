import { resolve } from 'node:path';

const src = (path: string) => resolve(process.cwd(), 'src', path);

export const aliases = [{ find: /^@\/(.*)$/, replacement: src('$1') }];
