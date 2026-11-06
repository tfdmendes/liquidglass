import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadPlaywright(env = process.env) {
  const module = env.LG_PLAYWRIGHT_MODULE || env.PLAYWRIGHT_MODULE || 'playwright';
  return import(isAbsolute(module) || module.startsWith('.') ? pathToFileURL(resolve(module)).href : module);
}

export function executablePath(engine, env = process.env) {
  if (engine === 'firefox' || engine === 'gecko') return env.LG_FIREFOX_EXECUTABLE || env.FIREFOX_EXECUTABLE;
  if (engine === 'chromium' || engine === 'blink') return env.LG_CHROME_EXECUTABLE || env.CHROME_EXECUTABLE || env.CHROME;
  return env.LG_WEBKIT_EXECUTABLE || env.WEBKIT_EXECUTABLE;
}

export function launchOptions(engine, env = process.env) {
  const path = executablePath(engine, env);
  return { headless: true, ...(path ? { executablePath: path } : {}) };
}
