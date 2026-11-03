/**
 * Tests for naming the agent CLI on both platforms.
 *
 * A Windows `PATH` search is not the POSIX one: `gh` is `gh.exe` (PATHEXT), `\` separates directories, and `;` splits
 * `PATH`. Each rule set needs the filesystem it describes, so the platform-specific tests run on that platform — the
 * point of a Windows runner is that this file's Windows half actually executes there. The rules that are only strings
 * (a refused relative path, a refused `.cmd`, the `env` prefix) run on both.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { executable, workerArgv } from '../src/deployment.ts'

const windows = process.platform === 'win32'
let directory: string
/** An executable file named `name` in the fixture directory; executable on POSIX so one fixture serves both rule sets. */
const file = (name: string): string => { const path = join(directory, name); writeFileSync(path, ''); chmodSync(path, 0o755); return path }

beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'executable-')) })
afterEach(() => { rmSync(directory, { recursive: true, force: true }) })

describe('a POSIX search', () => {
  it.runIf(!windows)('finds the command name as written, and never adds an extension', () => {
    const bare = file('gh')
    expect(executable('gh', directory)).toBe(bare)
    rmSync(bare)
    file('gh.exe')
    // On POSIX `gh.exe` is a different file name, so a bare command name does not find it.
    expect(() => executable('gh', directory)).toThrow('gh is not an executable file on PATH')
  })
  it.runIf(!windows)('skips a file without the execute bit, and takes an absolute path as written', () => {
    const path = join(directory, 'gh')
    writeFileSync(path, '')
    chmodSync(path, 0o644)
    expect(() => executable('gh', directory)).toThrow('gh is not an executable file on PATH')
    expect(executable(path, '')).toBe(path)
  })
})

describe('a Windows search', () => {
  it.runIf(windows)('finds gh.exe for the command name gh', () => {
    const exe = file('gh.exe')
    expect(executable('gh', directory)).toBe(exe)
  })
  it.runIf(windows)('finds gh.com when no gh.exe is installed, and a name that already carries its extension', () => {
    const com = file('gh.com')
    expect(executable('gh', directory)).toBe(com)
    expect(executable('gh.com', directory)).toBe(com)
  })
  it.runIf(windows)('names the .cmd it found instead of reporting the command absent', () => {
    const cmd = file('gh.cmd')
    // Node cannot spawn a .cmd without a shell, and "not on PATH" would send the reader looking for a missing install.
    expect(() => executable('gh', directory)).toThrow(`${cmd}, which Node cannot spawn without a shell; name the .exe instead`)
  })
  it.runIf(windows)('splits PATH on the Windows delimiter and skips an entry that is not absolute', () => {
    const exe = file('gh.exe')
    expect(executable('gh', ['relative/bin', directory].join(';'))).toBe(exe)
  })
  it.runIf(windows)('looks for the extension on an absolute path too, as the shell does', () => {
    const exe = file('gh.exe')
    expect(executable(join(directory, 'gh'), '')).toBe(exe)
  })
})

describe('the rules that are the same on every runner', () => {
  it('refuses a relative path rather than searching PATH for the name it spells', () => {
    expect(() => executable('bin/gh', directory, undefined, 'linux')).toThrow('bin/gh must be a command name or an absolute path')
    // Windows treats `\` as a separator too, so the same refusal applies to a drive-less path there.
    expect(() => executable('bin\\gh', directory, undefined, 'win32')).toThrow('bin\\gh must be a command name or an absolute path')
  })
  it('refuses a .cmd or .bat named outright, because Node cannot spawn one without a shell', () => {
    expect(() => executable('gh.cmd', '', undefined, 'win32')).toThrow('gh.cmd is a .cmd file, which Node cannot spawn without a shell')
    expect(() => executable('C:\\tools\\gh.bat', '', undefined, 'win32')).toThrow('gh.bat is a .bat file, which Node cannot spawn without a shell')
  })
})

describe('the argv a startup check runs with', () => {
  it('hands the shim-free PATH to the command through env on POSIX', () => {
    expect(workerArgv(['gh', 'api', 'user'], '/state/worker-bin:/usr/bin', 'linux'))
      .toEqual(['env', 'PATH=/state/worker-bin:/usr/bin', 'gh', 'api', 'user'])
  })
  it('runs the command unchanged on Windows, which ships no env helper', () => {
    // `env` does not exist on Windows, so the POSIX prefix failed setup with `spawn env ENOENT`.
    expect(workerArgv(['gh', 'api', 'user'], 'C:\\state\\worker-bin', 'win32')).toEqual(['gh', 'api', 'user'])
  })
})
