import { join, resolve } from 'node:path';
import { exec, execSync } from 'node:child_process';
import { createWriteStream, readFileSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import process from 'node:process';
import standardChangelog from 'standard-changelog';
import { version as _version } from '../package.json';
const execPromise = promisify(exec);

const VERSION_REG = /\d+\.\d+\.\d+/;

function getLastChangeLogCommit() {
  const gitCommand = 'git blame CHANGELOG.md';
  const changeLogCommits = execSync(gitCommand, {
    cwd: process.cwd(),
    encoding: 'utf-8',
  }).split('\n');

  return changeLogCommits.find(cmt => VERSION_REG.test(cmt))?.slice(0, 8) ?? '';
}

function getGitCommitMap(lastCommit: string) {
  const gitCommand = `git log --pretty=format:"%H:%cn" ${lastCommit}..HEAD`;
  const gitLogMap = execSync(gitCommand, { cwd: process.cwd(), encoding: 'utf-8' }).toString();
  writeFileSync('.gitlogmap', gitLogMap, 'utf8');
}

function updateChangeLog() {
  console.log(` package.json version: ${_version}\n`);

  const lastCommit = getLastChangeLogCommit();
  if (lastCommit === '00000000') {
    console.log('no commit found, skip changelog update');
    return;
  }
  const initialChangelogStr = readFileSync(join(`${resolve()}/CHANGELOG.md`), 'utf8') || '';

  const pageDataStr = `${initialChangelogStr.match(/---[\s\S]+---/)![0]}\n`;
  const data = initialChangelogStr.split(/---[\s\S]+---/);
  data.unshift(pageDataStr);

  new Promise(resolve => {
    standardChangelog({}, null, { from: lastCommit, to: 'HEAD' })
      .on('data', (chunk: any) => {
        let changeLogStr = chunk.toString().trim();
        changeLogStr = changeLogStr.replaceAll(/\(([\d-]+)\)/g, '`$1`');
        changeLogStr = changeLogStr.replaceAll(/^#\s/g, '## ').trim();
        data.splice(1, 0, `${changeLogStr}\n`);
      })
      .on('end', resolve);
  }).then(async () => {
    getGitCommitMap(lastCommit);

    const writeStream = createWriteStream('CHANGELOG.md', 'utf8');
    writeStream.write(data.join('\n'));
    writeStream.end();
    console.log('generate changelog done.');

    await execPromise('git add CHANGELOG.md');
    await execPromise(`git commit -m "chore: update changelog"`);
    await execPromise('git push');
  });
}
updateChangeLog();
