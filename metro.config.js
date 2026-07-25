const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/**
 * Default Expo Metro config, plus support for running from a git worktree.
 *
 * A worktree under .claude/worktrees/<name>/ has no node_modules of its own, so
 * it gets symlinked to the main checkout's. Metro resolves that symlink to its
 * real path, which sits outside the worktree root, and then refuses to serve
 * files it isn't watching ("Unable to resolve expo-modules-core ...").
 *
 * So: if node_modules resolves outside this project, widen the watch and
 * resolution roots to cover it. In an ordinary checkout the real path is inside
 * the project and nothing changes.
 */
const config = getDefaultConfig(__dirname);

try {
  const real = fs.realpathSync(path.join(__dirname, 'node_modules'));
  if (!real.startsWith(__dirname + path.sep)) {
    config.watchFolders = [...(config.watchFolders ?? []), path.dirname(real)];
    config.resolver.nodeModulesPaths = [real];
  }
} catch {
  // No node_modules yet (fresh clone) — the defaults are correct.
}

module.exports = config;
