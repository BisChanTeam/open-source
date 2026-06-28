/*
MIT License

Copyright (c) 2026 SupromTeam

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

const path = require('path');
const fs = require('fs/promises');

const createStorage = ({ files, log }) => {
  const { usersFile, messagesFile, groupsFile, channelsFile, reportsFile } =
    files;

  const parseJsonLenient = (raw) => {
    const candidates = [];
    const withoutBom = String(raw || '').replace(/^\uFEFF/, '');
    candidates.push(withoutBom);

    const trimmed = withoutBom.trim();
    if (
      (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('`') && trimmed.endsWith('`'))
    ) {
      candidates.push(trimmed.slice(1, -1));
    }

    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      try {
        const unwrapped = JSON.parse(trimmed);
        if (typeof unwrapped === 'string') candidates.push(unwrapped);
      } catch {
        // Ignore and continue with the remaining candidates.
      }
    }

    let lastError;
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Invalid JSON');
  };

  const saveCorruptSnapshot = async (filePath, raw) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.corrupt-${stamp}.bak`;
    await fs.writeFile(backupPath, raw, 'utf8');
    return backupPath;
  };

  const writeJson = async (filePath, data) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  };

  const readJson = async (filePath, fallback) => {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      if (!raw) return fallback;
      try {
        return parseJsonLenient(raw);
      } catch (parseErr) {
        let backupPath = null;
        let backupError = null;
        try {
          backupPath = await saveCorruptSnapshot(filePath, raw);
        } catch (snapshotErr) {
          backupError = snapshotErr.message;
        }
        log('warn', 'data_bad_json', {
          filePath,
          error: parseErr.message,
          backupPath,
          backupError,
        });
        await writeJson(filePath, fallback);
        return fallback;
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        await writeJson(filePath, fallback);
        return fallback;
      }
      throw err;
    }
  };

  const ensureArray = async (data, filePath) => {
    if (Array.isArray(data)) return data;
    await writeJson(filePath, []);
    return [];
  };

  const removeFileIfExists = async (filePath) => {
    if (!filePath) return;
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        log('warn', 'uploads_cleanup_failed', { error: err.message });
      }
    }
  };

  const loadUsers = async () =>
    ensureArray(await readJson(usersFile, []), usersFile);
  const loadMessages = async () =>
    ensureArray(await readJson(messagesFile, []), messagesFile);
  const loadGroups = async () =>
    ensureArray(await readJson(groupsFile, []), groupsFile);
  const loadChannels = async () =>
    ensureArray(await readJson(channelsFile, []), channelsFile);
  const loadReports = async () =>
    ensureArray(await readJson(reportsFile, []), reportsFile);
  const saveUsers = (users) => writeJson(usersFile, users);
  const saveMessages = (messages) => writeJson(messagesFile, messages);
  const saveReports = (reports) => writeJson(reportsFile, reports);

  return {
    loadUsers,
    loadMessages,
    loadGroups,
    loadChannels,
    loadReports,
    saveUsers,
    saveMessages,
    saveReports,
    removeFileIfExists,
  };
};

module.exports = { createStorage };
